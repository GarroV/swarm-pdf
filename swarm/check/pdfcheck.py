"""Проверка PDF после правки текста: (1) буквы без рисунка во встроенном шрифте (пустой квадрат),
(2) наложение строк разных абзацев. Код возврата 1 — найдены поломки."""
import io
import re
import subprocess
import sys

import pikepdf
from fontTools.ttLib import TTFont


def tounicode_map(font):
    tu = font.get("/ToUnicode")
    if tu is None:
        return {}
    data = tu.read_bytes().decode("latin-1")
    m = {}
    for block in re.findall(r"beginbfchar(.*?)endbfchar", data, re.S):
        for src, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            m[int(src, 16)] = bytes.fromhex(dst).decode("utf-16-be", "replace")
    for block in re.findall(r"beginbfrange(.*?)endbfrange", data, re.S):
        for lo, hi, dst in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            base = int(dst, 16)
            for i, c in enumerate(range(int(lo, 16), int(hi, 16) + 1)):
                m[c] = chr(base + i)
    return m


def load_cid_font(font):
    """Type0 + FontFile2 → (TTFont, cid→gid функция). Иначе None."""
    if font.get("/Subtype") != "/Type0":
        return None
    desc = font["/DescendantFonts"][0]
    fd = desc.get("/FontDescriptor")
    if fd is None or "/FontFile2" not in fd:
        return None
    tt = TTFont(io.BytesIO(fd["/FontFile2"].read_bytes()))
    c2g = desc.get("/CIDToGIDMap")
    if isinstance(c2g, pikepdf.Stream):
        raw = c2g.read_bytes()
        return tt, lambda cid: int.from_bytes(raw[cid * 2:cid * 2 + 2], "big") if cid * 2 + 1 < len(raw) else 0
    return tt, lambda cid: cid


def glyph_sig(tt, name):
    g = tt["glyf"][name]
    if g.numberOfContours == 0:
        return None
    coords, ends, _ = g.getCoordinates(tt["glyf"])
    return (tuple(ends), tuple(coords))


def has_outline(tt, gid):
    """Есть настоящий рисунок: не пустой и не копия .notdef (квадрат «нет буквы»)."""
    order = tt.getGlyphOrder()
    if gid <= 0 or gid >= len(order):
        return False
    if "glyf" not in tt:
        return True
    sig = glyph_sig(tt, order[gid])
    if sig is None:
        return False
    return sig != glyph_sig(tt, order[0]) and not is_box(sig)


def is_box(sig):
    """Рамка «нет буквы»: осевые прямоугольники, и один лежит внутри другого (у точки и двоеточия
    квадраты стоят рядом, а не вложены)."""
    ends, coords = sig
    boxes, start = [], 0
    for end in ends:
        pts = coords[start:end + 1]
        start = end + 1
        xs, ys = {x for x, _ in pts}, {y for _, y in pts}
        if len(pts) != 4 or len(xs) != 2 or len(ys) != 2:
            return False
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    return any(a != b and a[0] <= b[0] and a[1] <= b[1] and a[2] >= b[2] and a[3] >= b[3]
               for a in boxes for b in boxes)


def scan(stream_owner, resources, pno, problems, seen):
    fonts = resources.get("/Font", {}) if resources is not None else {}
    xobjs = resources.get("/XObject", {}) if resources is not None else {}
    cache = {}
    current = None
    for operands, op in pikepdf.parse_content_stream(stream_owner):
        op = str(op)
        if op == "Do":
            name = str(operands[0])
            xo = xobjs.get(name)
            if xo is not None and xo.get("/Subtype") == "/Form" and xo.objgen not in seen:
                seen.add(xo.objgen)
                scan(xo, xo.get("/Resources", resources), pno, problems, seen)
            continue
        if op == "Tf":
            current = str(operands[0])
            continue
        if op not in ("Tj", "TJ", "'", '"') or current not in fonts:
            continue
        if current not in cache:
            f = fonts[current]
            cache[current] = (load_cid_font(f), tounicode_map(f))
        loaded, tu = cache[current]
        if loaded is None:
            continue
        tt, c2g = loaded
        items = operands[0] if op == "TJ" else [operands[-1]]
        for it in items:
            if not isinstance(it, pikepdf.String):
                continue
            b = bytes(it)
            for i in range(0, len(b) - 1, 2):
                cid = int.from_bytes(b[i:i + 2], "big")
                ch = tu.get(cid, "?")
                if ch.isspace():
                    continue
                if not has_outline(tt, c2g(cid)):
                    problems.append(f"стр.{pno}: «{ch}» без рисунка в шрифте {current}")


def missing_glyphs(path):
    problems = []
    pdf = pikepdf.open(path)
    for pno, page in enumerate(pdf.pages, 1):
        scan(page, page.obj.get("/Resources"), pno, problems, set())
    return sorted(set(problems))


def overlapping_lines(path):
    out = subprocess.run(["pdftotext", "-bbox-layout", path, "-"], capture_output=True, text=True).stdout
    problems = []
    for pno, page in enumerate(re.findall(r"<page .*?</page>", out, re.S), 1):
        lines = []
        for bi, block in enumerate(re.findall(r"<block .*?</block>", page, re.S)):
            for ln in re.findall(r'<line xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</line>', block, re.S):
                x0, y0, x1, y1 = map(float, ln[:4])
                text = " ".join(re.findall(r">([^<]+)</word>", ln[4]))
                lines.append((x0, y0, x1, y1, text))
        for i in range(len(lines)):
            for j in range(i + 1, len(lines)):
                a, b = lines[i], lines[j]
                ox = min(a[2], b[2]) - max(a[0], b[0])
                oy = min(a[3], b[3]) - max(a[1], b[1])
                h = min(a[3] - a[1], b[3] - b[1])
                if ox > 5 and h > 0 and oy > 0.1 * h:
                    problems.append(f"стр.{pno}: «{a[4][:40]}» накладывается на «{b[4][:40]}»")
    return problems


if __name__ == "__main__":
    path = sys.argv[1]
    probs = missing_glyphs(path) + overlapping_lines(path)
    for p in probs:
        print("✘", p)
    print("✔ поломок не найдено" if not probs else f"итого поломок: {len(probs)}")
    sys.exit(1 if probs else 0)
