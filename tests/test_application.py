"""Run against python3 -m http.server 8000; requires Playwright + Chromium."""
import io
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
NS = {'p': 'http://www.hancom.co.kr/hwpml/2011/paragraph'}


def verify_archive(blob, expected):
    original = zipfile.ZipFile(ROOT / 'templates/application.hwpx')
    output = zipfile.ZipFile(io.BytesIO(blob))
    assert output.testzip() is None
    assert output.namelist() == original.namelist()
    assert output.infolist()[0].filename == 'mimetype'
    assert output.infolist()[0].compress_type == zipfile.ZIP_STORED
    for item in original.namelist():
        if item not in ('Contents/section0.xml', 'Preview/PrvText.txt'):
            assert output.read(item) == original.read(item), item
        if item.endswith(('.xml', '.hpf', '.rdf')):
            ET.fromstring(output.read(item))
    section = ET.fromstring(output.read('Contents/section0.xml'))
    before = ET.fromstring(original.read('Contents/section0.xml'))
    # Only text nodes may be added. Every existing structural node and all its
    # attributes (table dimensions, merges, paragraph/run styles, etc.) survive.
    def structure(node):
        return node.tag, node.attrib, [structure(c) for c in node if c.tag != '{' + NS['p'] + '}t']
    assert structure(section) == structure(before)
    table = section.find('.//p:tbl', NS)
    def text(row, col):
        for tr in table.findall('p:tr', NS):
            for cell in tr.findall('p:tc', NS):
                addr = cell.find('p:cellAddr', NS)
                if addr.get('rowAddr') == str(row) and addr.get('colAddr') == str(col):
                    return ''.join(cell.itertext())
        raise AssertionError((row, col))
    for (row, col), value in expected.items():
        assert value in text(row, col), (row, col, value, text(row, col))
    print('PASS: archive integrity, all XML, original styles/merges/dimensions, filled values')


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8000/')
    page.wait_for_selector('#grid button[data-id]')
    assert page.locator('#grid tr').count() == 40
    assert page.locator('#grid button[data-id]').count() == 721
    assert page.locator('#applicationGenerate').inner_text() == '신청서 보기'
    assert page.locator('#applicationDownload').inner_text() == '신청서 HWPX로 저장'
    lesson = page.evaluate('() => sheet.lessons.find(l=>swapCandidates(sheet,l.id).length)?.id')
    page.locator(f'#grid button[data-id="{lesson}"]').click()
    page.locator('#results [data-proposal]').first.click()
    page.locator('#saveSwap').click()
    assert page.locator('#savedCount').inner_text() == '1'
    page.locator('#close').click()
    page.reload()
    page.wait_for_selector('#grid button[data-id]')
    assert page.locator('#savedCount').inner_text() == '1'
    page.locator('#savedOpen').click()
    page.locator('#applicationOpen').click()
    data = page.evaluate('''() => {
      const c=applicationChoices()[0];
      const date=day=>`2026-11-${String(2+day).padStart(2,'0')}`;
      return {absence:date(c.own.day),makeup:date(c.other.day),period:c.own.period,
       group:c.own.group,subject:c.own.subject,otherSubject:c.other.subject,
       otherName:name(c.other.teacher),teacherName:name(c.own.teacher),otherPeriod:c.other.period};
    }''')
    page.locator('#absenceDate').fill(data['absence'])
    page.locator('[data-request-date]').fill(data['makeup'])
    note = '교외연수 & <교체> "확인"'
    page.locator('#applicationNote').fill(note)
    with page.expect_popup() as popup:
        page.locator('#applicationGenerate').click()
    preview = popup.value
    preview.wait_for_load_state()
    assert data['teacherName'] in preview.locator('.applicant').inner_text()
    assert note in preview.locator('.notes').inner_text()
    assert preview.locator('.period-row').count() == 7
    preview.close()
    with page.expect_download() as dl:
        page.locator('#applicationDownload').click()
    download = dl.value
    assert download.suggested_filename.endswith('.hwpx')
    blob = Path(download.path()).read_bytes()
    row = data['period'] + 4
    verify_archive(blob, {(0, 0): data['teacherName'], (row, 1): data['group'],
      (row, 3): data['subject'], (row, 4): data['otherSubject'],
      (row, 5): data['otherName'], (row, 7): str(data['otherPeriod']), (13, 0): note})
    # Multiple rows, edge periods, escaped names, empty rows and notes.
    blob = bytes(page.evaluate('''async () => {
      const data={teacherName:'김<&교사',absenceDate:'2026-11-02',reason:'',note:'',rows:[
       {own:{period:1,group:'1-1',subject:'국어'},other:{subject:'수학',period:7},otherName:'이&교사',makeupDate:'2026-11-03'},
       {own:{period:7,group:'3-2',subject:'국어'},other:{subject:'영어',period:1},otherName:'박<교사',makeupDate:'2026-11-04'}]};
      return Array.from(applicationHwpx(await applicationTemplate(),data));
    }'''))
    verify_archive(blob, {(0, 0): '김<&교사', (5, 1): '1-1', (11, 1): '3-2',
      (5, 5): '이&교사', (11, 5): '박<교사', (6, 1): '', (13, 0): ''})
    # Failed fetch is reported, controls recover, and retry succeeds.
    page.evaluate('applicationTemplatePromise=null')
    page.route('**/templates/application.hwpx', lambda route: route.fulfill(status=503, body='unavailable'))
    page.locator('#applicationDownload').click()
    page.wait_for_function("document.getElementById('applicationError').textContent.includes('원본')")
    assert page.locator('#applicationDownload').is_enabled()
    page.unroute('**/templates/application.hwpx')
    with page.expect_download():
        page.locator('#applicationDownload').click()
    assert page.locator('#applicationError').inner_text() == ''
    # Existing date/day validation must continue to block mismatched lessons.
    page.locator('#absenceDate').fill('2026-11-01')
    page.locator('#applicationDownload').click()
    assert '맞는' in page.locator('#applicationError').inner_text()
    assert not errors, errors
    browser.close()
    print('PASS: existing recommendations/save/reload, preview, HWPX download, fetch retry, date validation; no JS errors')
