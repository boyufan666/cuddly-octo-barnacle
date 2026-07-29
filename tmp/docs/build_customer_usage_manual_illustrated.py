from __future__ import annotations

from datetime import date
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[2]
SCREEN_DIR = ROOT / "output/doc/screenshots"
OUT = ROOT / "output/doc/认知康复服务平台图文版客户使用与启动说明书.docx"

BLUE = RGBColor(46, 116, 181)
DARK_BLUE = RGBColor(31, 77, 120)
INK = RGBColor(20, 28, 38)
MUTED = RGBColor(90, 96, 106)
LIGHT_BLUE = "E8EEF5"
LIGHT_GRAY = "F6F8FA"
WARN_FILL = "FFF4CE"


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


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = tc_pr.find(qn("w:shd"))
    if shd is None:
        shd = OxmlElement("w:shd")
        tc_pr.append(shd)
    shd.set(qn("w:fill"), fill)


def set_cell_margins(cell, top=80, start=120, bottom=80, end=120) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    tc_mar = tc_pr.first_child_found_in("w:tcMar")
    if tc_mar is None:
        tc_mar = OxmlElement("w:tcMar")
        tc_pr.append(tc_mar)
    for key, value in (("top", top), ("start", start), ("bottom", bottom), ("end", end)):
        node = tc_mar.find(qn(f"w:{key}"))
        if node is None:
            node = OxmlElement(f"w:{key}")
            tc_mar.append(node)
        node.set(qn("w:w"), str(value))
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


def configure_doc(doc: Document) -> None:
    section = doc.sections[0]
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(0.75)
    section.bottom_margin = Inches(0.75)
    section.left_margin = Inches(0.75)
    section.right_margin = Inches(0.75)
    section.header_distance = Inches(0.42)
    section.footer_distance = Inches(0.42)

    header = section.header.paragraphs[0]
    header.text = "认知康复服务平台 | 图文版客户说明书"
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    for run in header.runs:
        set_run_font(run, size=8.5, color=MUTED)

    footer = section.footer.paragraphs[0]
    footer.text = "图中账号与数据仅用于本地演示；正式试点请使用客户正式账号与真实授权数据"
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for run in footer.runs:
        set_run_font(run, size=8, color=MUTED)

    styles = doc.styles
    normal = styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:eastAsia"), "Microsoft YaHei")
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.2

    for name, size, color, before, after in [
        ("Heading 1", 16, BLUE, 16, 8),
        ("Heading 2", 13, BLUE, 10, 6),
        ("Heading 3", 11.5, DARK_BLUE, 8, 4),
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
        style.font.size = Pt(10.5)
        style.paragraph_format.space_after = Pt(3)
        style.paragraph_format.line_spacing = 1.18
        style.paragraph_format.left_indent = Inches(0.32)
        style.paragraph_format.first_line_indent = Inches(-0.16)


def add_title(doc: Document) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(4)
    r = p.add_run("认知康复服务平台")
    set_run_font(r, size=24, bold=True, color=INK)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(12)
    r = p.add_run("图文版客户使用与启动说明书")
    set_run_font(r, size=17, bold=True, color=BLUE)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(12)
    r = p.add_run("给客户现场人员看的图文操作手册：照着图找页面，照着步骤完成登录、训练、复核、家属查看和数据导出。")
    set_run_font(r, size=10.8, color=MUTED)

    add_kv_table(
        doc,
        [
            ("文档版本", "V1.0 图文版"),
            ("生成日期", date.today().isoformat()),
            ("截图来源", "本机真实启动后的浏览器页面截图"),
            ("适用场景", "Mac 本机部署、局域网多人试用、客户现场演示"),
        ],
        widths=[1.25, 5.75],
    )
    add_callout(
        doc,
        "先看这一段",
        [
            "多人使用不是靠 Git，而是大家访问同一台主机电脑的 Web 地址。",
            "主机电脑不能关机、不能休眠，Docker、后端和前端终端要保持运行。",
            "演示账号、示例数据和截图只用于说明操作，不能作为真实临床或科研数据。",
        ],
        WARN_FILL,
    )


def add_kv_table(doc: Document, rows: list[tuple[str, str]], widths=(1.4, 5.6)) -> None:
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
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_callout(doc: Document, title: str, lines: list[str], fill: str = LIGHT_GRAY) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    set_table_width(table, [7.0])
    cell = table.cell(0, 0)
    set_cell_shading(cell, fill)
    set_cell_margins(cell, 110, 150, 110, 150)
    p = cell.paragraphs[0]
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(title)
    set_run_font(r, size=10.8, bold=True, color=DARK_BLUE)
    for line in lines:
        p = cell.add_paragraph(style="List Bullet")
        p.add_run(line)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def h1(doc: Document, text: str) -> None:
    doc.add_heading(text, level=1)


def h2(doc: Document, text: str) -> None:
    doc.add_heading(text, level=2)


def add_bullets(doc: Document, items: list[str]) -> None:
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.add_run(item)


def add_code(doc: Document, code: str) -> None:
    table = doc.add_table(rows=1, cols=1)
    table.style = "Table Grid"
    set_table_width(table, [7.0])
    cell = table.cell(0, 0)
    set_cell_shading(cell, LIGHT_GRAY)
    set_cell_margins(cell, 90, 130, 90, 130)
    for idx, line in enumerate(code.strip().splitlines()):
        p = cell.paragraphs[0] if idx == 0 else cell.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(line)
        r.font.name = "Menlo"
        r._element.rPr.rFonts.set(qn("w:ascii"), "Menlo")
        r._element.rPr.rFonts.set(qn("w:hAnsi"), "Menlo")
        r._element.rPr.rFonts.set(qn("w:eastAsia"), "Menlo")
        r.font.size = Pt(8.2)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)


def add_image_section(
    doc: Document,
    title: str,
    image_name: str,
    caption: str,
    bullets: list[str],
    *,
    new_page: bool = False,
) -> None:
    if new_page:
        doc.add_page_break()
    h2(doc, title)
    image_path = SCREEN_DIR / image_name
    if not image_path.exists():
        raise FileNotFoundError(image_path)
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(3)
    p.add_run().add_picture(str(image_path), width=Inches(6.8))
    cp = doc.add_paragraph()
    cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cp.paragraph_format.space_after = Pt(6)
    r = cp.add_run(caption)
    set_run_font(r, size=9, color=MUTED)
    add_bullets(doc, bullets)


def build_doc() -> None:
    doc = Document()
    configure_doc(doc)
    add_title(doc)

    h1(doc, "1. 启动后先确认两个地址")
    add_bullets(
        doc,
        [
            "Web 页面地址：本机访问 http://localhost:3000，其他设备访问主机 IP 的 3000 端口。",
            "API 健康检查地址：http://localhost:4000/health，显示 ok 表示后端正常。",
            "客户如果只是在同一 Wi-Fi 内多人试用，先不要配置 Git，先确认所有人都能打开同一个 Web 地址。",
        ],
    )
    add_code(
        doc,
        "pnpm infra:up\npnpm --filter @rehab-platform/api start\npnpm --filter @rehab-platform/web dev",
    )
    add_image_section(
        doc,
        "1.1 API 健康检查",
        "00-api-health.png",
        "图 1：浏览器打开 API 健康检查地址，看到 ok 说明后端服务正常。",
        [
            "如果这里打不开，先检查 Docker、PostgreSQL 和后端终端。",
            "如果这里正常但 Web 登录失败，重点检查前端 API 地址和后端 WEB_ORIGIN。",
        ],
    )

    h1(doc, "2. 登录和账号申请")
    add_image_section(
        doc,
        "2.1 机构账号登录",
        "01-login-account-request.png",
        "图 2：左侧用机构分配账号登录，右侧用于没有账号时提交开通申请。",
        [
            "已有账号直接在左侧输入账号和密码，然后点“进入工作台”。",
            "没有账号先在右侧提交申请，管理员审核后才能正式登录。",
            "演示账号常用：admin / doctor001 / patient001 / caregiver001，演示密码为 253913。",
        ],
        new_page=True,
    )

    h1(doc, "3. 患者端怎么用")
    add_image_section(
        doc,
        "3.1 今日任务",
        "02-patient-today.png",
        "图 3：患者登录后先看“今日”，这里会提示下一步该做评估、训练或等待医生确认。",
        [
            "患者端底部是四个入口：今日、训练、记录、我的。",
            "有训练任务时，从“今日”进入会更直观。",
            "如果显示等待医生确认，说明需要医生端先确认评估、计划或准备记录。",
        ],
        new_page=True,
    )
    add_image_section(
        doc,
        "3.2 训练前检查",
        "03-patient-training.png",
        "图 4：开始训练前，系统会检查训练安排、摄像头和站位等准备项。",
        [
            "患者先点“同步训练安排”，确认医生已经下发准备记录。",
            "摄像头和站位通过后，训练按钮才可以使用。",
            "如果提示未选择训练项目，回到“今日”选择本次训练任务。",
        ],
    )
    add_image_section(
        doc,
        "3.3 训练记录",
        "04-patient-records.png",
        "图 5：患者可以在“记录”里查看已保存的训练结果、完成情况和医生复核状态。",
        [
            "这里展示的是已保存的训练数据，不是手填结果。",
            "如果刚训练完看不到记录，先刷新页面或确认训练结果是否提交成功。",
        ],
        new_page=True,
    )
    add_image_section(
        doc,
        "3.4 我的资料与授权",
        "05-patient-profile-auth.png",
        "图 6：“我的”里查看患者资料、隐私授权和家属授权绑定。",
        [
            "真实采集前要确认摄像头、语音、家属共享等授权范围。",
            "家属能看到什么，取决于这里的授权和后台关系绑定。",
        ],
    )

    h1(doc, "4. 医生端怎么用")
    add_image_section(
        doc,
        "4.1 患者工作清单",
        "06-doctor-patients.png",
        "图 7：医生端从“患者”进入，查看负责患者，也可以创建患者档案与登录账号。",
        [
            "医生负责患者建档、查看患者状态和推动下一步业务。",
            "如果患者端没有任务，医生端通常需要先检查评估、计划或准备。",
        ],
        new_page=True,
    )
    add_image_section(
        doc,
        "4.2 评估确认",
        "07-doctor-assessment.png",
        "图 8：医生在“评估”页确认结构化评估与风险状态。",
        [
            "AI 和语音材料只能作为辅助建议，最终以医生确认结果为准。",
            "评估确认后，后续计划推荐和训练安排才有依据。",
        ],
    )
    add_image_section(
        doc,
        "4.3 康复计划确认",
        "08-doctor-plan.png",
        "图 9：医生在“计划”页调整训练频次、时长、难度和调整原因，然后确认计划。",
        [
            "缺少计划或调整原因时，不应直接下发训练。",
            "确认后的计划会影响患者端可执行的训练项目。",
        ],
        new_page=True,
    )
    add_image_section(
        doc,
        "4.4 训练准备",
        "09-doctor-preparation.png",
        "图 10：医生在“准备”页创建训练安排、设备要求和准备记录。",
        [
            "患者端点“同步训练安排”后，会读取医生端创建的准备记录。",
            "如果患者端不能开始训练，优先检查这里是否已经创建并保存。",
        ],
    )
    add_image_section(
        doc,
        "4.5 结果复核",
        "10-doctor-review.png",
        "图 11：医生在“复核”页查看训练结果并填写复核结论。",
        [
            "患者提交训练结果后，医生在这里完成临床复核。",
            "复核后家属端看到的进展会更完整、更可靠。",
        ],
        new_page=True,
    )

    h1(doc, "5. 家属端怎么用")
    add_image_section(
        doc,
        "5.1 今日照护",
        "11-caregiver-care.png",
        "图 12：家属端只展示授权范围内的照护摘要和今日安排。",
        [
            "家属不能看到未授权患者，也不能看到医生内部治理信息。",
            "如果授权被撤销，家属端不应继续展示对应患者数据。",
        ],
    )
    add_image_section(
        doc,
        "5.2 训练进展",
        "12-caregiver-progress.png",
        "图 13：家属在“进展”页查看脱敏后的训练次数、最近一次训练和完成状态。",
        [
            "这里适合家属了解陪伴和提醒，不替代医生诊断。",
            "家属看到的是摘要，不是原始训练载荷或技术指标。",
        ],
        new_page=True,
    )
    add_image_section(
        doc,
        "5.3 提醒与家庭观察",
        "13-caregiver-alerts.png",
        "图 14：医生提醒和家庭观察记录用于辅助日常照护沟通。",
        [
            "家属可以按授权范围查看提醒和照护建议。",
            "涉及病情判断的问题仍应由医生确认。",
        ],
    )

    h1(doc, "6. 管理员端怎么用")
    add_image_section(
        doc,
        "6.1 账号治理",
        "14-admin-accounts.png",
        "图 15：管理员在“账号”页审核申请、创建或管理不同角色账号。",
        [
            "正式试点不要长期共用演示账号。",
            "客户应由管理员统一开通医生、患者、家属和审计账号。",
        ],
        new_page=True,
    )
    add_image_section(
        doc,
        "6.2 内容治理",
        "15-admin-content.png",
        "图 16：管理员在“内容”页管理训练内容和上下架状态。",
        [
            "游戏内容可以按思维训练和运动训练进行管理。",
            "患者端看到的是被下发的训练任务，不需要看到技术配置。",
        ],
    )
    add_image_section(
        doc,
        "6.3 配置治理",
        "16-admin-config.png",
        "图 17：管理员在“配置”页维护采集条件、训练协议和准备标准。",
        [
            "配置类内容适合管理员或运维人员处理。",
            "普通患者、家属不需要进入这些治理页面。",
        ],
        new_page=True,
    )
    add_image_section(
        doc,
        "6.4 审计与脱敏导出",
        "17-admin-audit-export.png",
        "图 18：管理员在“审计”页查询日志、填写原因并导出脱敏数据。",
        [
            "导出前必须填写用途说明，导出行为会记录审计日志。",
            "常见导出包括患者档案、评估记录、训练记录、授权记录和审计日志。",
            "导出的 CSV 通常在浏览器下载目录中。",
        ],
    )

    h1(doc, "7. 多人使用时客户最容易问的问题")
    add_callout(
        doc,
        "一句话回答客户",
        [
            "只要主机电脑开着、服务运行、网络能访问，其他人就可以用手机或电脑访问同一个 Web 地址。",
            "其他电脑不要输入自己的 localhost，要输入主机电脑的局域网 IP 地址。",
            "如果要外网访问，建议配置 Cloudflare Tunnel 或正式 HTTPS 域名；项目本身不靠 Git 提供多人访问。",
        ],
        WARN_FILL,
    )
    add_kv_table(
        doc,
        [
            ("本机访问", "http://localhost:3000"),
            ("局域网访问", "http://主机IP:3000，例如 http://10.15.212.102:3000"),
            ("API 地址", "http://主机IP:4000 或 Cloudflare 后端域名"),
            ("不能关闭", "主机 Mac、Docker、后端终端、前端终端"),
            ("正式数据", "必须由真实授权、真实评估、真实训练和医生复核产生"),
        ],
        widths=[1.35, 5.65],
    )

    h1(doc, "8. 现场快速检查")
    add_kv_table(
        doc,
        [
            ("Docker", "docker ps 能看到 PostgreSQL"),
            ("后端", "浏览器打开 http://localhost:4000/health 返回 ok"),
            ("前端", "浏览器打开 http://localhost:3000"),
            ("登录", "管理员、医生、患者、家属都能登录"),
            ("业务链", "医生确认计划和准备，患者训练，医生复核，家属看进展"),
            ("导出", "管理员填写原因后导出 CSV，审计日志可查"),
        ],
        widths=[1.35, 5.65],
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    print(OUT)


if __name__ == "__main__":
    build_doc()
