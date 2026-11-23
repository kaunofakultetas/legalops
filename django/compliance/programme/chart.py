############################################################
#  [*] programme.chart — a structure drawn as a tree
#
#    structure_svg(nodes, language) → the chart as SVG text
#
#  The structure of a governance product is a tree of bodies,
#  committees, functions and units. It is drawn once, here,
#  for the page and the PDF alike: each node a box under its
#  parent, coloured by the line it belongs to — the governing
#  bodies in ink, the first line pale, the second outlined in
#  blue, the third marked in yellow — and dashed where the
#  node is proposed rather than found in the company's
#  documents. A legend under the tree says so in words, so
#  the colours carry nothing a reader cannot also read.
#
#  The layout is the one organisation charts are usually set
#  in. The upper levels spread as rows: a body alone, what
#  reports to it in a row beneath, ordered by line — the
#  three lines read left to right. What reports to a body
#  and has nothing under it does not take a column of its
#  own: such nodes hang together, by line, on one rail. The
#  deeper levels are stacked under their parent, a step to
#  the right for every level. How many levels spread as rows
#  is whichever makes the drawing fit a landscape page best,
#  so a structure of twenty-five nodes stays readable on
#  paper. Every text is escaped; nothing is fetched.
############################################################


from html import escape


BOX_W, BOX_H, GAP_X, GAP_Y, MARGIN = 180, 66, 22, 34, 16
# In a stack: the step to the right a level, the space between boxes
INDENT, STACK_GAP = 22, 10
LINE_CHARS, LINES = 23, 3
# The most childless nodes hung on one rail, the levels that may spread
# as rows, and the shape the drawing aims at — a landscape page's box
RAIL, ROW_LEVELS, PAGE_W, PAGE_H = 5, (1, 2, 3), 263, 148
LINE_ORDER = ("governing", "first", "second", "third", "external")

# line → (fill, stroke, text)
COLOURS = {
    "governing": ("#173A6E", "#173A6E", "#FFFFFF"),
    "first": ("#EEF3FA", "#8FB1E3", "#16202E"),
    "second": ("#FFFFFF", "#3E6FB0", "#16202E"),
    "third": ("#FFF6CC", "#C9A400", "#16202E"),
    "external": ("#F4F6F9", "#A9B3C1", "#16202E"),
}
LEGEND = {
    "lt": (("governing", "Valdymo organai"), ("first", "Pirmoji linija"), ("second", "Antroji linija"),
           ("third", "Trečioji linija"), ("external", "Išorės užtikrinimas")),
    "en": (("governing", "Governing bodies"), ("first", "First line"), ("second", "Second line"),
           ("third", "Third line"), ("external", "External assurance")),
}
PROPOSED = {"lt": "siūloma", "en": "proposed"}








############################################################
# _lines
############################################################
#
# A node's name on at most three lines of the box, cut with
# an ellipsis when it is longer.
#
# Used by:
#   - structure_svg (below)
############################################################

def _lines(name):
    lines = [""]
    for word in name.split():
        if not lines[-1] or len(lines[-1]) + len(word) + 1 <= LINE_CHARS:
            lines[-1] = f"{lines[-1]} {word}".strip()
        elif len(lines) < LINES:
            lines.append(word)
        else:
            lines[-1] = lines[-1][:LINE_CHARS - 1].rstrip(" ,") + "…"
            break
    return [line if len(line) <= LINE_CHARS + 2 else line[:LINE_CHARS + 1] + "…" for line in lines]








############################################################
# structure_svg
############################################################
#
# The chart of a structure's nodes ({id, name, line, parentId,
# proposed}) with its legend, in the product's language. An
# empty structure is an empty drawing.
#
# Used by:
#   - programme/api/views.py — product_chart
#   - programme/exports.py — the governance product's PDF
############################################################

def structure_svg(nodes, language):
    by_id = {node["id"]: node for node in nodes}
    children = {}
    for node in nodes:
        children.setdefault(node["parentId"] if node["parentId"] in by_id else None, []).append(node["id"])
    tops = children.get(None, [])
    rank = lambda node_id: LINE_ORDER.index(by_id[node_id]["line"]) if by_id[node_id]["line"] in LINE_ORDER else len(LINE_ORDER)

    def deepest(node_id):
        return 1 + max((deepest(child) for child in children.get(node_id, [])), default=0)

    def below(node_id):
        return sum(1 + below(child) for child in children.get(node_id, []))

    # What stands in the row under a node: each child that has children
    # alone, the childless ones gathered by line onto rails
    def row_of(node_id):
        row, rail = [], None
        for child in sorted(children.get(node_id, []), key=rank):
            if children.get(child):
                row.append(("branch", child))
                rail = None
                continue
            if rail is None or rail[0] != by_id[child]["line"] or len(rail[1]) >= RAIL:
                rail = (by_id[child]["line"], [])
                row.append(("rail", rail[1]))
            rail[1].append(child)
        return row

    def size(node_id, levels):
        if not children.get(node_id):
            return BOX_W, BOX_H
        if levels == 0:
            return BOX_W + (deepest(node_id) - 1) * INDENT, BOX_H + below(node_id) * (BOX_H + STACK_GAP)
        sizes = [size(value, levels - 1) if kind == "branch"
                 else (INDENT + BOX_W, len(value) * (BOX_H + STACK_GAP) - STACK_GAP) for kind, value in row_of(node_id)]
        return (max(BOX_W, sum(w for w, _ in sizes) + GAP_X * (len(sizes) - 1)),
                BOX_H + GAP_Y + max(h for _, h in sizes))


    # STEP 1: how many levels spread as rows — whichever fits the page best
    # =====================================================================
    def whole(levels):
        sizes = [size(top, levels) for top in tops] or [(BOX_W, BOX_H)]
        return sum(w for w, _ in sizes) + GAP_X * (len(sizes) - 1), max(h for _, h in sizes)

    levels = max(ROW_LEVELS, key=lambda count: (min(PAGE_W / whole(count)[0], PAGE_H / whole(count)[1]), -count))


    # STEP 2: every node placed — rows above, stacks and rails below
    # ==============================================================
    place, links, rows = {}, [], []

    def stack(parent, depth, column_x, y):
        for child in children.get(parent, []):
            place[child] = (column_x + depth * INDENT, y)
            links.append((parent, child))
            y = stack(child, depth + 1, column_x, y + BOX_H + STACK_GAP)
        return y

    def put(node_id, x, y, levels):
        if levels == 0 or not children.get(node_id):
            place[node_id] = (x, y)
            stack(node_id, 1, x, y + BOX_H + STACK_GAP)
            return
        row = row_of(node_id)
        widths = [size(value, levels - 1)[0] if kind == "branch" else INDENT + BOX_W for kind, value in row]
        width = max(BOX_W, sum(widths) + GAP_X * (len(row) - 1))
        place[node_id] = (x + (width - BOX_W) / 2, y)
        cx, top, drops = x + (width - sum(widths) - GAP_X * (len(row) - 1)) / 2, y + BOX_H + GAP_Y, []
        for (kind, value), item_width in zip(row, widths):
            if kind == "branch":
                put(value, cx, top, levels - 1)
                drops.append((place[value][0] + BOX_W / 2, top, []))
            else:
                for index, leaf in enumerate(value):
                    place[leaf] = (cx + INDENT, top + index * (BOX_H + STACK_GAP))
                drops.append((cx + INDENT / 2, place[value[-1]][1] + BOX_H / 2, value))
            cx += item_width + GAP_X
        rows.append((node_id, drops))

    x = MARGIN
    for top in tops:
        put(top, x, MARGIN, levels)
        x += size(top, levels)[0] + GAP_X
    legend = LEGEND.get(language, LEGEND["en"])
    legend_width = sum(30 + len(label) * 6.2 for _, label in legend)
    right = max([px + BOX_W for px, _ in place.values()] + [MARGIN + BOX_W, MARGIN + legend_width])
    bottom = max([py + BOX_H for _, py in place.values()] + [MARGIN + BOX_H])
    width, tree_height = right + MARGIN, bottom - MARGIN
    height = MARGIN * 2 + tree_height + 34


    # STEP 3: the connectors, then the boxes over them
    # ================================================
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" width="{width:.0f}" '
             f'height="{height:.0f}" font-family="Source Sans 3, Segoe UI, Helvetica Neue, Arial, sans-serif" font-size="13">']
    line = lambda d: f'<path d="{d}" fill="none" stroke="#A9B3C1" stroke-width="1"/>'
    for parent, drops in rows:
        px, py = place[parent]
        centre, middle = px + BOX_W / 2, py + BOX_H + GAP_Y / 2
        reach = [centre] + [drop_x for drop_x, _, _ in drops]
        parts.append(line(f"M{centre:.1f} {py + BOX_H:.1f} V{middle:.1f} M{min(reach):.1f} {middle:.1f} H{max(reach):.1f}"))
        for drop_x, drop_y, hung in drops:
            parts.append(line(f"M{drop_x:.1f} {middle:.1f} V{drop_y:.1f}"))
            for leaf in hung:
                lx, ly = place[leaf]
                parts.append(line(f"M{drop_x:.1f} {ly + BOX_H / 2:.1f} H{lx:.1f}"))
    for parent, child in links:
        px, py = place[parent]
        cx, cy = place[child]
        parts.append(line(f"M{px + INDENT / 2:.1f} {py + BOX_H:.1f} V{cy + BOX_H / 2:.1f} H{cx:.1f}"))
    for node in nodes:
        if node["id"] not in place:
            continue
        x, y = place[node["id"]]
        fill, stroke, ink = COLOURS.get(node["line"], COLOURS["first"])
        dash = ' stroke-dasharray="5 3"' if node.get("proposed") else ""
        parts.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{BOX_W}" height="{BOX_H}" rx="4" fill="{fill}" '
                     f'stroke="{stroke}" stroke-width="1.4"{dash}/>')
        lines = _lines(node["name"])
        top = y + (BOX_H - (12 if node.get("proposed") else 0)) / 2 - (len(lines) - 1) * 7.5 + 4.5
        for index, words in enumerate(lines):
            parts.append(f'<text x="{x + BOX_W / 2:.1f}" y="{top + index * 15:.1f}" text-anchor="middle" fill="{ink}" '
                         f'font-weight="600">{escape(words)}</text>')
        if node.get("proposed"):
            parts.append(f'<text x="{x + BOX_W / 2:.1f}" y="{y + BOX_H - 5:.1f}" text-anchor="middle" fill="{ink}" '
                         f'font-size="10" font-style="italic">{escape(PROPOSED.get(language, PROPOSED["en"]))}</text>')


    # STEP 4: the legend
    # ==================
    x, y = MARGIN, MARGIN + tree_height + 20
    for line, label in legend:
        fill, stroke, _ = COLOURS[line]
        parts.append(f'<rect x="{x}" y="{y}" width="14" height="10" rx="2" fill="{fill}" stroke="{stroke}" stroke-width="1.2"/>')
        parts.append(f'<text x="{x + 19}" y="{y + 9}" fill="#5B6676" font-size="11">{escape(label)}</text>')
        x += 30 + len(label) * 6.2
    parts.append("</svg>")
    return "".join(parts)
