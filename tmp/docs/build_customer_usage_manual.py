from __future__ import annotations

from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/doc/认知康复服务平台客户使用与启动说明书.docx"

BLUE = RGBColor(46, 116, 181)
DARK_BLUE = RGBColor(31, 77, 120)
INK = RGBColor(20, 28, 38)
MUTED = RGBColor(90, 96, 106)
LIGHT_BLUE = "E8EEF5"
LIGHT_GRAY = "F6F8FA"
WARN_FILL = "FFF4CE"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120) -> None:
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for m, v in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{m}"))
        if node is None:
            node = OxmlElement(f"w:{m}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(v))
        node.set(qn("w:type"), "dxa")


def set_table_width(table, widths_inches: list[float]) -> None:
    table.autofit = False
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    for row in table.rows:
        for idx, width in enumerate(widths_inches):
            cell = row.cells[idx]
            cell.width = Inches(width)
            tc_pr = cell._tc.get_or_add_tcPr()
            tc_w = tc_pr.find(qn("w:tcW"))
            if tc_w is None:
                tc_w = OxmlElement("w:tcW")
                tc_pr.append(tc_w)
            tc_w.set(qn("w:w"), str(int(width * 1440)))
            tc_w.set(qn("w:type"), "dxa")


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_run_font(run, size=None, bold=None, color=None, font="Calibri") -> None:
    run.font.name = font
    run._element.rPr.rFonts.set(qn("w:ascii"), font)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), font)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color


def configure_styles(doc: Document) -> None:
    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(11)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.25

    for name, size, color, before, after in [
        ("Heading 1", 16, BLUE, 18, 10),
        ("Heading 2", 13, BLUE, 14, 7),
        ("Heading 3", 12, DARK_BLUE, 10, 5),
    ]:
        style = styles[name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.keep_with_next = True

    for name in ["List Bullet", "List Number"]:
        style = styles[name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
        style.font.size = Pt(11)
        style.paragraph_format.space_after = Pt(4)
        style.paragraph_format.line_spacing = 1.25
        style.paragraph_format.left_indent = Inches(0.375)
        style.paragraph_format.first_line_indent = Inches(-0.188)


def configure_page(doc: Document) -> None:
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.right_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)

    header = section.header.paragraphs[0]
    header.text = "认知康复服务平台 | 客户使用与启动说明书"
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in header.runs:
        set_run_font(run, size=9, color=MUTED)

    footer = section.footer.paragraphs[0]
    footer.text = "请勿将演示账号、示例数据或本地密码作为正式临床/科研数据使用"
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in footer.runs:
        set_run_font(run, size=8.5, color=MUTED)


def add_title_page(doc: Document) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(26)
    p.paragraph_format.space_after = Pt(6)
    r = p.add_run("认知康复服务平台")
    set_run_font(r, size=25, bold=True, color=INK)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(18)
    r = p.add_run("客户使用与启动说明书")
    set_run_font(r, size=18, bold=True, color=BLUE)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(20)
    r = p.add_run("适用于 Mac 客户现场部署、局域网多人试用、Cloudflare Tunnel 临时外网访问与日常业务操作。")
    set_run_font(r, size=11.5, color=MUTED)

    meta = [
        ("文档版本", "V1.0"),
        ("生成日期", date.today().isoformat()),
        ("系统范围", "患者端、医生端、家属端、管理端、数据导出与审计"),
        ("默认部署", "一台 Mac 作为主机，其他电脑/手机通过浏览器访问"),
    ]
    add_kv_table(doc, meta, widths=[1.35, 5.15])

    add_callout(
        doc,
        "最重要的三句话",
        [
            "多人使用不是靠 Git，同一时间访问的是部署主机提供的 Web 地址。",
            "如果用一台 Mac 做主机，主机 Mac 必须保持开机、联网、不休眠，Docker、后端和前端服务都要持续运行。",
            "演示账号和本地初始化数据只用于确认系统能跑通，不能当作真实患者数据、临床数据、科研数据或正式验收数据。",
        ],
        fill=WARN_FILL,
    )

    spacer = doc.add_paragraph()
    spacer.paragraph_format.space_after = Pt(10)


def add_paragraph(doc: Document, text: str, *, style=None, bold_prefix: str | None = None) -> None:
    p = doc.add_paragraph(style=style)
    if bold_prefix and text.startswith(bold_prefix):
        r = p.add_run(bold_prefix)
        set_run_font(r, bold=True)
        rest = text[len(bold_prefix) :]
        if rest:
            p.add_run(rest)
    else:
        p.add_run(text)


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(item)


def add_numbers(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Number")
        p.add_run(item)


def add_code(doc: Document, code: str) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    set_table_width(table, [6.5])
    cell = table.cell(0, 0)
    set_cell_shading(cell, LIGHT_GRAY)
    set_cell_margins(cell, 100, 140, 100, 140)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    lines = code.strip("\n").splitlines() or [""]
    for idx, line in enumerate(lines):
        p = cell.paragraphs[0] if idx == 0 else cell.add_paragraph()
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(line)
        r.font.name = "Menlo"
        r._element.rPr.rFonts.set(qn("w:ascii"), "Menlo")
        r._element.rPr.rFonts.set(qn("w:hAnsi"), "Menlo")
        r._element.rPr.rFonts.set(qn("w:eastAsia"), "Menlo")
        r.font.size = Pt(8.8)
        r.font.color.rgb = RGBColor(35, 35, 35)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_callout(doc: Document, title: str, lines: list[str], fill: str = LIGHT_GRAY) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    set_table_width(table, [6.5])
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    set_cell_margins(cell, 120, 160, 120, 160)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run(title)
    set_run_font(r, size=11.5, bold=True, color=DARK_BLUE)
    for line in lines:
        p = cell.add_paragraph(style=None)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.left_indent = Inches(0.14)
        p.paragraph_format.first_line_indent = Inches(-0.14)
        p.add_run("• ")
        p.add_run(line)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_kv_table(doc: Document, rows: list[tuple[str, str]], widths=(1.875, 4.625)) -> None:
    table = doc.add_table(rows=0, cols=2)
    table.style = "Table Grid"
    set_table_width(table, list(widths))
    for label, value in rows:
        row = table.add_row()
        row.cells[0].text = label
        row.cells[1].text = value
        for cell in row.cells:
            set_cell_margins(cell)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
        set_cell_shading(row.cells[0], LIGHT_BLUE)
        for paragraph in row.cells[0].paragraphs:
            for run in paragraph.runs:
                set_run_font(run, bold=True, color=DARK_BLUE)
        for paragraph in row.cells[1].paragraphs:
            for run in paragraph.runs:
                set_run_font(run, color=INK)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_matrix_table(doc: Document, headers: list[str], rows: list[list[str]], widths: list[float]) -> None:
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    set_table_width(table, widths)
    header = table.rows[0]
    set_repeat_table_header(header)
    for idx, text in enumerate(headers):
        cell = header.cells[idx]
        set_cell_shading(cell, LIGHT_BLUE)
        set_cell_margins(cell)
        cell.text = text
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            for r in p.runs:
                set_run_font(r, bold=True, color=DARK_BLUE)
    for row_values in rows:
        row = table.add_row()
        for idx, value in enumerate(row_values):
            cell = row.cells[idx]
            cell.text = value
            set_cell_margins(cell)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
            for p in cell.paragraphs:
                p.paragraph_format.space_after = Pt(0)
                if idx == 0:
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    set_run_font(r, size=10.2)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def h1(doc: Document, text: str) -> None:
    doc.add_heading(text, level=1)


def h2(doc: Document, text: str) -> None:
    doc.add_heading(text, level=2)


def h3(doc: Document, text: str) -> None:
    doc.add_heading(text, level=3)


def build_doc() -> None:
    doc = Document()
    configure_page(doc)
    configure_styles(doc)
    add_title_page(doc)

    h1(doc, "1. 文档目的和适用范围")
    add_paragraph(
        doc,
        "这份说明书给客户现场人员使用，目标是让客户能在一台 Mac 上启动认知康复服务平台，并让多名患者、医生、家属或管理人员通过浏览器访问同一套系统。"
    )
    add_bullets(
        doc,
        [
            "适合场景：客户现场演示、局域网多人试用、小规模试点、通过 Cloudflare Tunnel 临时开放外网访问。",
            "不适合场景：直接作为医院正式生产部署规范。正式生产需要 HTTPS 域名、独立数据库账号、备份、监控、日志留存、密钥托管和运维责任人。",
            "本说明书会同时给出演示试用和正式试点的区别，避免把本地示例数据误用为真实业务数据。",
        ]
    )

    h1(doc, "2. 系统组成")
    add_matrix_table(
        doc,
        ["组件", "用途", "默认地址/端口"],
        [
            ["前端 Web", "患者端、医生端、家属端、管理端页面", "http://localhost:3000"],
            ["后端 API", "登录、权限、评估、计划、训练、审计、导出", "http://localhost:4000"],
            ["PostgreSQL", "保存患者、评估、训练、授权、审计等业务数据", "localhost:55432"],
            ["Docker Desktop", "运行 PostgreSQL 容器", "本机应用"],
            ["Node.js / pnpm", "运行前端、后端和数据库脚本", "Node 22，pnpm 10.29.3"],
        ],
        [1.25, 3.35, 1.9],
    )

    h1(doc, "3. 客户电脑准备清单")
    add_bullets(
        doc,
        [
            "一台 Mac 电脑作为部署主机，建议接电源并关闭自动休眠。",
            "安装 Docker Desktop，并确认 Docker Desktop 已启动。",
            "安装 Node.js 22。",
            "安装 VS Code 或 IntelliJ IDEA 均可；如果客户只有 VS Code，也能打开和运行项目。",
            "安装 Chrome、Edge 或 Safari 浏览器；体感训练建议优先用 Chrome。",
            "主机 Mac 和其他访问设备需要在同一个局域网，或由运维配置 Cloudflare Tunnel/正式域名。",
            "如果要使用摄像头体感训练，需要浏览器允许摄像头权限；多人远程访问时建议使用 HTTPS 域名。",
        ]
    )

    h1(doc, "4. 项目目录和文件放置")
    add_paragraph(doc, "把源码包解压到客户 Mac 上一个固定目录，例如：")
    add_code(doc, "/Users/客户用户名/Projects/Rehabilitation platform")
    add_paragraph(doc, "后续所有命令都在这个项目根目录执行。打开终端后可以用下面的方式进入目录：")
    add_code(doc, "cd \"/Users/客户用户名/Projects/Rehabilitation platform\"")
    add_callout(
        doc,
        "目录提醒",
        [
            "路径里有空格时，命令里的路径必须加英文双引号。",
            "不要把项目放在微信临时目录、下载临时目录或会自动清理的目录。",
            "部署说明书不放进源码包时，可以单独发给客户保存到桌面或项目交付资料目录。",
        ],
    )

    h1(doc, "5. 第一次启动：演示试用版")
    h2(doc, "5.1 安装依赖")
    add_paragraph(doc, "进入项目根目录后，第一次运行需要安装依赖：")
    add_code(doc, "pnpm install --frozen-lockfile")
    add_paragraph(doc, "如果客户电脑提示没有 pnpm，可以先执行：")
    add_code(doc, "corepack enable\ncorepack prepare pnpm@10.29.3 --activate")

    h2(doc, "5.2 启动 PostgreSQL")
    add_paragraph(doc, "先启动 Docker Desktop，等左下角或顶部状态显示 Docker 正常运行后，在项目根目录执行：")
    add_code(doc, "pnpm infra:up")
    add_paragraph(doc, "检查容器是否运行：")
    add_code(doc, "docker ps")
    add_paragraph(doc, "应能看到 rehab-platform-postgres 容器。")

    h2(doc, "5.3 初始化数据库")
    add_paragraph(doc, "演示试用或本地验收可以执行下面三步：")
    add_code(
        doc,
        'pnpm db:generate\nDATABASE_URL="postgresql://rehab:253913@localhost:55432/rehab_platform?schema=public" pnpm --filter @rehab-platform/db exec prisma migrate dev --name init\nDATABASE_URL="postgresql://rehab:253913@localhost:55432/rehab_platform?schema=public" pnpm db:seed',
    )
    add_callout(
        doc,
        "演示数据边界",
        [
            "pnpm db:seed 只用于本地演示、开发和自动化验收。",
            "它创建的账号、患者、评估、训练记录或示例数据不能作为正式临床数据、科研数据、试点数据或客户最终验收数据。",
            "如果客户开始真实试点，请使用第 6 章的正式试点初始化方式。",
        ],
        fill=WARN_FILL,
    )

    h2(doc, "5.4 配置前端 API 地址")
    add_paragraph(doc, "本机自己访问时，在项目根目录执行：")
    add_code(doc, "mkdir -p apps/web\nprintf 'NEXT_PUBLIC_API_BASE_URL=\"http://localhost:4000\"\\n' > apps/web/.env.local")

    h2(doc, "5.5 启动后端")
    add_paragraph(doc, "打开一个终端窗口，进入项目根目录，执行：")
    add_code(
        doc,
        'DATABASE_URL="postgresql://rehab:253913@localhost:55432/rehab_platform?schema=public" \\\nJWT_SECRET="rehab-customer-local-long-random-secret-change-me" \\\nWEB_ORIGIN="http://localhost:3000" \\\nPORT="4000" \\\nAI_REQUIRED_FOR_LAUNCH="false" \\\nSPEECH_REQUIRED_FOR_LAUNCH="false" \\\nTTS_REQUIRED_FOR_LAUNCH="false" \\\npnpm --filter @rehab-platform/api start',
    )
    add_paragraph(doc, "后端启动后不要关闭这个终端窗口。另开一个终端执行健康检查：")
    add_code(doc, "curl http://localhost:4000/health")
    add_paragraph(doc, '正常返回类似：{"status":"ok","service":"rehab-platform-api"}。')

    h2(doc, "5.6 启动前端")
    add_paragraph(doc, "再打开一个新的终端窗口，进入项目根目录，执行：")
    add_code(doc, "pnpm --filter @rehab-platform/web dev")
    add_paragraph(doc, "浏览器打开：")
    add_code(doc, "http://localhost:3000")

    h1(doc, "6. 正式试点初始化方式")
    add_paragraph(
        doc,
        "如果客户准备录入真实患者、真实评估和真实训练数据，不要执行 pnpm db:seed。正式试点应只初始化机构、管理员和首个医生账号，然后由系统业务流程产生患者、评估、计划、训练和导出数据。"
    )
    h2(doc, "6.1 必填变量")
    add_code(
        doc,
        "DATABASE_URL\nTRIAL_ORG_CODE\nTRIAL_ORG_NAME\nTRIAL_ORG_TYPE\nTRIAL_ADMIN_ACCOUNT\nTRIAL_ADMIN_DISPLAY_NAME\nTRIAL_ADMIN_INITIAL_PASSWORD\nTRIAL_DOCTOR_ACCOUNT\nTRIAL_DOCTOR_DISPLAY_NAME\nTRIAL_DOCTOR_INITIAL_PASSWORD\nTRIAL_DOCTOR_TITLE\nTRIAL_DOCTOR_DEPARTMENT",
    )
    add_bullets(
        doc,
        [
            "管理员初始密码和医生初始密码必须不同。",
            "不要使用 253913、123456、客户公开文档里的示例密码或多人共用密码。",
            "正式试点交付后，客户管理员和医生应尽快完成密码重置。",
        ]
    )
    h2(doc, "6.2 执行命令")
    add_code(
        doc,
        "pnpm install --frozen-lockfile\npnpm db:generate\npnpm db:migrate\npnpm db:seed:trial",
    )
    add_paragraph(
        doc,
        "pnpm db:seed:trial 不会创建患者、家属关系、知情同意、AI 评估、康复计划、训练记录或动作指标。真实数据必须通过业务流程产生。"
    )

    h1(doc, "7. 多人访问方式")
    h2(doc, "7.1 Git 不是多人访问方式")
    add_callout(
        doc,
        "多人访问原则",
        [
            "Git 只用于代码版本管理和源码交付，不是让多人使用系统的方式。",
            "多人使用的正确方式是：一台电脑运行系统，其他电脑或手机通过浏览器访问这台电脑的地址。",
            "客户问“只要我电脑不关，其他人能不能在手机、电脑访问”，答案是：可以，但前提是主机开机联网、服务运行、网络可达、地址配置正确。",
        ],
    )

    h2(doc, "7.2 局域网多人访问")
    add_numbers(
        doc,
        [
            "确认主机 Mac 和其他电脑/手机连接同一个 Wi-Fi 或同一局域网。",
            "在主机 Mac 上查看本机局域网 IP。系统设置 -> Wi-Fi -> 详细信息，或终端执行 ipconfig getifaddr en0。",
            "假设主机 IP 是 10.15.212.102，其他设备访问 http://10.15.212.102:3000。",
            "前端 API 地址也要改成主机 IP：NEXT_PUBLIC_API_BASE_URL=\"http://10.15.212.102:4000\"。",
            "后端 WEB_ORIGIN 要改成实际前端地址：WEB_ORIGIN=\"http://10.15.212.102:3000\"。",
            "如果别人打不开，检查 Mac 防火墙是否拦截 3000 和 4000 端口。",
        ]
    )
    add_code(doc, "printf 'NEXT_PUBLIC_API_BASE_URL=\"http://10.15.212.102:4000\"\\n' > apps/web/.env.local")
    add_paragraph(doc, "局域网访问启动后，其他人不要输入自己电脑的 localhost:3000。localhost 永远表示当前这台电脑，不表示主机 Mac。")

    h2(doc, "7.3 Cloudflare Tunnel 临时外网访问")
    add_paragraph(
        doc,
        "如果客户希望不在同一局域网的人也能访问，最快的临时方案是 Cloudflare Tunnel。项目本身不内置 Cloudflare 配置，需要客户或运维准备域名和 Tunnel。推荐两个地址："
    )
    add_kv_table(
        doc,
        [
            ("前端域名", "https://rehab.example.com -> localhost:3000"),
            ("后端域名", "https://rehab-api.example.com -> localhost:4000"),
            ("前端配置", 'NEXT_PUBLIC_API_BASE_URL="https://rehab-api.example.com"'),
            ("后端配置", 'WEB_ORIGIN="https://rehab.example.com"'),
        ],
        widths=[1.35, 5.15],
    )
    add_bullets(
        doc,
        [
            "Cloudflare 适合临时试用和小范围测试，主机 Mac 仍然不能关机或休眠。",
            "如果涉及摄像头、麦克风或多人远程训练，HTTPS 比局域网 HTTP 更稳定。",
            "正式生产建议使用客户正式服务器、正式域名、HTTPS 证书、备份和监控，不建议长期依赖个人电脑。",
        ]
    )

    h1(doc, "8. 默认账号")
    add_paragraph(doc, "演示 seed 后常用账号如下，密码以本地 seed 配置为准；当前本地演示常用密码为 253913。")
    add_matrix_table(
        doc,
        ["角色", "账号", "用途"],
        [
            ["管理员", "admin", "账号审核、内容配置、审计、数据导出"],
            ["医生", "doctor001", "患者建档、评估确认、计划确认、训练准备、结果复核"],
            ["患者", "patient001", "查看今日任务、开始训练、查看记录和个人信息"],
            ["家属", "caregiver001", "查看授权摘要、进展、提醒和个人信息"],
            ["运营", "operator001", "受限的运营管理能力"],
            ["审计", "auditor001", "只读审计查看能力"],
        ],
        [1.0, 1.5, 4.0],
    )
    add_callout(
        doc,
        "账号安全",
        [
            "正式试点不要继续使用演示账号和固定密码。",
            "客户应由管理员创建或审核正式账号，并按客户安全策略设置密码。",
            "离开客户现场前，应确认客户已接管正式管理员账号。",
        ],
        fill=WARN_FILL,
    )

    h1(doc, "9. 每天启动系统")
    add_numbers(
        doc,
        [
            "打开主机 Mac，确认连上网络并接通电源。",
            "打开 Docker Desktop，等待 Docker 运行正常。",
            "打开终端，进入项目根目录。",
            "执行 pnpm infra:up，确认 PostgreSQL 容器运行。",
            "打开后端终端，执行第 5.5 节后端启动命令。",
            "打开前端终端，执行 pnpm --filter @rehab-platform/web dev。",
            "浏览器访问前端地址并登录检查。",
            "如果要多人访问，把实际访问地址发给客户人员。",
        ]
    )
    add_paragraph(doc, "如果已经有后端/前端终端窗口在运行，不要重复开多个服务。先看终端是否还在输出正常日志。")

    h1(doc, "10. 角色使用说明")
    h2(doc, "10.1 患者端")
    add_bullets(
        doc,
        [
            "导航：今日 / 训练 / 记录 / 我的。",
            "今日：查看下一步任务，可能是评估、训练或等待医生确认。",
            "训练：在医生下发计划和准备完成后开始训练，按页面提示完成动作或思维训练。",
            "记录：查看已经保存的训练结果、医生复核状态和历史记录。",
            "我的：查看个人信息、授权状态和账号相关信息。",
        ]
    )
    h2(doc, "10.2 医生端")
    add_bullets(
        doc,
        [
            "导航：患者 / 评估 / 计划 / 准备 / 复核。",
            "患者：查看负责患者，创建或维护患者资料。",
            "评估：录入或复核评估结果，确认风险状态。",
            "计划：查看系统建议方案，医生确认后下发给患者。",
            "准备：为患者创建训练安排、设备要求和准备记录。",
            "复核：查看患者训练结果，完成医生复核和处理意见。",
        ]
    )
    h2(doc, "10.3 家属端")
    add_bullets(
        doc,
        [
            "导航：照护 / 进展 / 提醒 / 我的。",
            "家属只能看到被授权患者的脱敏摘要和进展信息。",
            "授权撤销后，家属端不应继续展示该患者数据。",
            "家属端适合查看提醒、陪伴记录和简要进展，不承担医生确认职责。",
        ]
    )
    h2(doc, "10.4 管理员端")
    add_bullets(
        doc,
        [
            "导航：账号 / 内容 / 配置 / 审计。",
            "账号：审核注册申请、创建或管理角色账号。",
            "内容：管理训练内容和游戏配置。",
            "配置：管理采集条件、训练协议等配置。",
            "审计：查看审计日志，按权限执行脱敏数据导出。",
        ]
    )

    h1(doc, "11. 推荐正式业务流程")
    add_numbers(
        doc,
        [
            "管理员创建或审核医生、患者、家属账号。",
            "医生进入患者页，完成患者建档。",
            "患者或授权流程完成知情同意和家属授权。",
            "医生完成评估并确认风险状态。",
            "医生进入计划页，确认或调整康复方案。",
            "医生进入准备页，创建训练安排和设备要求。",
            "患者进入今日或训练页，开始训练并提交结果。",
            "医生进入复核页，查看训练结果并完成复核。",
            "家属在授权范围内查看脱敏进展和提醒。",
            "管理员在审计页按需查询日志或导出脱敏数据。",
        ]
    )

    h1(doc, "12. 数据导出说明")
    add_paragraph(doc, "数据导出在管理员端审计相关区域完成。导出需要权限，并且必须填写导出原因。")
    add_matrix_table(
        doc,
        ["可导出数据集", "说明", "注意事项"],
        [
            ["患者档案", "患者基础档案信息", "应按客户授权范围使用"],
            ["评估记录", "评估类型、结果和医生确认状态", "不要脱离患者授权单独传播"],
            ["训练记录", "训练 session、结果、分数和复核状态", "用于统计和运营分析"],
            ["授权记录", "知情同意和家属授权记录", "用于合规留痕"],
            ["审计日志", "登录、访问、导出、复核等日志", "只有具备审计权限的账号可导出"],
        ],
        [1.25, 2.35, 2.9],
    )
    add_bullets(
        doc,
        [
            "导出文件为 CSV，浏览器通常会保存到“下载”目录。",
            "导出原因不能随便填空白或无意义内容，建议写清用途，例如“6 月试点训练记录汇总”。",
            "导出操作会写入审计日志，方便后续追踪是谁、什么时候、为什么导出。",
            "对外提供数据前，客户应自行确认是否满足机构隐私、伦理和合规要求。",
        ]
    )

    h1(doc, "13. 关闭、重启和数据保留")
    h2(doc, "13.1 临时关闭前后端")
    add_paragraph(doc, "在运行前端和后端的终端窗口里按 Ctrl+C，看到命令停止后即可关闭窗口。")
    h2(doc, "13.2 关闭 PostgreSQL")
    add_code(doc, "pnpm infra:down")
    add_paragraph(doc, "关闭容器不等于删除数据。项目的 infra/data 目录保存本地数据库数据。")
    h2(doc, "13.3 下次重启")
    add_numbers(
        doc,
        [
            "先打开 Docker Desktop。",
            "执行 pnpm infra:up。",
            "启动后端。",
            "启动前端。",
            "访问系统并登录检查。",
        ]
    )
    add_callout(
        doc,
        "备份提醒",
        [
            "客户开始录入真实数据后，迁移电脑、重装系统或删除项目目录前必须先备份数据库。",
            "不要随意删除 infra/data 目录。",
            "只导出 CSV 不能完全替代数据库备份，因为审计、权限、关联关系等完整信息仍在数据库中。",
        ],
        fill=WARN_FILL,
    )

    h1(doc, "14. 常见问题处理")
    add_matrix_table(
        doc,
        ["问题", "常见原因", "处理方法"],
        [
            ["Docker 没反应", "Docker Desktop 未启动或还在初始化", "打开 Docker Desktop，等状态正常后再执行 pnpm infra:up"],
            ["终端卡住不动", "服务正在前台运行，等待访问请求", "不要关闭窗口，另开一个终端继续执行其他命令"],
            ["3000 打不开", "前端没有启动或端口被占用", "检查前端终端是否在运行，必要时重启前端"],
            ["4000 健康检查失败", "后端未启动、数据库未启动或环境变量错误", "先执行 docker ps，再重启后端并看报错"],
            ["登录失败", "API 地址不对、账号密码不对或数据库未初始化", "检查 NEXT_PUBLIC_API_BASE_URL、后端健康检查和账号密码"],
            ["别人电脑打不开", "用了 localhost、防火墙拦截或不在同一网络", "使用主机 IP，放行 3000/4000，确认同一 Wi-Fi"],
            ["页面能开但接口报错", "跨域来源不匹配", "把后端 WEB_ORIGIN 改成实际前端访问地址"],
            ["摄像头不可用", "浏览器权限、摄像头占用或非 HTTPS 限制", "允许浏览器权限，关闭占用摄像头的软件，远程访问优先 HTTPS"],
            ["导出失败", "权限不足或导出原因未填写", "使用管理员/审计权限账号，并填写清楚导出原因"],
            ["数据不见了", "连接到了新数据库或误删数据目录", "确认 DATABASE_URL 和 infra/data，不要重新 seed 覆盖正式试点"],
        ],
        [1.35, 2.05, 3.1],
    )

    h1(doc, "15. 正式使用注意事项")
    add_bullets(
        doc,
        [
            "客户真实使用前，应确认患者授权、家属授权、数据导出权限和审计留存要求。",
            "如果涉及 AI、语音、TTS、摄像头、Unity 或其他外部能力，应按客户正式供应商账号和密钥配置，不使用个人临时 token。",
            "如果客户希望长期多人使用，建议部署到正式服务器或至少使用受控的 Cloudflare Tunnel 和固定域名。",
            "正式数据不能靠手工制造、固定成绩、演示样例或本地脚本冒充。",
            "客户如果需要“制造数据”用于演示，可以明确标注为演示/测试数据；不能混入真实患者数据集，也不能作为临床或科研结论。",
            "每次导出、复核、授权变更都应保留审计记录。",
            "交付后建议客户安排固定运维负责人，负责启动、备份、账号、导出和故障处理。",
        ]
    )

    h1(doc, "16. 现场快速检查清单")
    add_matrix_table(
        doc,
        ["检查项", "通过标准"],
        [
            ["Docker 检查", "docker ps 能看到 PostgreSQL"],
            ["后端检查", "curl http://localhost:4000/health 返回 ok"],
            ["前端检查", "浏览器能打开 3000 页面"],
            ["登录检查", "管理员、医生、患者、家属至少各登录一次"],
            ["业务链检查", "医生确认计划和准备，患者训练，医生复核，家属看进展"],
            ["多人访问检查", "另一台电脑/手机能打开主机地址"],
            ["数据导出检查", "管理员填原因后能导出 CSV，审计日志可查"],
            ["停机重启检查", "重启 Docker、后端、前端后数据仍可见"],
        ],
        [2.35, 4.15],
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)


if __name__ == "__main__":
    build_doc()
    print(OUT)
