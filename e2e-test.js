const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 180000; // 3 minutes

let passed = 0;
let failed = 0;
let errors = [];

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    console.log(`  ❌ ${msg}`);
    errors.push(msg);
  }
}

async function runE2ETest() {
  console.log('========================================');
  console.log('绘本工坊 - 完整端到端测试');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    // ====== Step 1: 首页加载 ======
    console.log('【Step 1】测试首页加载...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    assert(title.includes('绘本工坊'), `页面标题 "${title}" 包含 "绘本工坊"`);

    // 检查品类 Tab 导航（scope 到 CategoryTabs 区域：border-b 父容器内的 rounded-t-lg 按钮）
    const tabsArea = page.locator('.border-b.border-gray-200');
    const categoryTabs = await tabsArea.locator('button:has-text("成语")').count() > 0;
    assert(categoryTabs, '品类 Tab 导航显示');

    // 检查品类 Tab：古诗、儿歌、谚语、童话
    const poetryTab = await tabsArea.locator('button:has-text("古诗")').count() > 0;
    assert(poetryTab, '古诗品类 Tab 显示');

    const nurseryTab = await tabsArea.locator('button:has-text("儿歌")').count() > 0;
    assert(nurseryTab, '儿歌曲类 Tab 显示');

    const proverbTab = await tabsArea.locator('button:has-text("谚语")').count() > 0;
    assert(proverbTab, '谚语品类 Tab 显示');

    const fairyTab = await tabsArea.locator('button:has-text("童话")').count() > 0;
    assert(fairyTab, '童话品类 Tab 显示');

    // 检查内容选择区域
    const contentSelectorExists = await page.locator('text=选择成语').count() > 0;
    assert(contentSelectorExists, '内容选择区域显示');

    // 检查任务队列
    const taskQueueExists = await page.locator('text=任务队列').count() > 0;
    assert(taskQueueExists, '任务队列区域显示');

    // 检查绘本成品（书架）
    const bookShelfExists = await page.locator('text=绘本成品').count() > 0;
    assert(bookShelfExists, '绘本成品区域显示');

    // 检查书架中已加载预生成绘本（index.json 中有 21 本，分布在 5 个品类）
    const bookCountText = await page.locator('span:has-text("本")').first().textContent();
    const bookNum = parseInt(bookCountText) || 0;
    assert(bookNum >= 20, `书架显示 ${bookNum} 本预生成绘本 (>= 20)`);

    // 检查内置成语是否显示
    const expectIdioms = ['画蛇添足', '守株待兔', '亡羊补牢', '井底之蛙', '狐假虎威',
      '掩耳盗铃', '刻舟求剑', '愚公移山', '拔苗助长', '叶公好龙'];
    for (const idiom of expectIdioms) {
      const exists = await page.locator(`button:has-text("${idiom}")`).count() > 0;
      assert(exists, `内置成语 "${idiom}" 显示在列表中`);
    }

    // ====== Step 2: 自定义输入验证 ======
    console.log('\n【Step 2】测试自定义输入...');
    const input = page.locator('input[placeholder="输入成语..."]');
    assert(await input.count() > 0, '自定义输入框存在');

    await input.fill('杯弓蛇影');
    const inputValue = await input.inputValue();
    assert(inputValue === '杯弓蛇影', `输入框值正确: "${inputValue}"`);

    // 输入后"开始生成"按钮应启用
    const startBtn = page.locator('button:has-text("开始生成")');
    await page.waitForTimeout(500);
    const isDisabled = await startBtn.isDisabled();
    assert(!isDisabled, '输入自定义成语后，开始按钮已启用');

    // 清空输入，按钮应重新禁用
    await input.fill('');
    await page.waitForTimeout(300);
    const isDisabledAgain = await startBtn.isDisabled();
    assert(isDisabledAgain, '清空输入后，开始按钮禁用');

    // ====== Step 3: 换一批功能测试 ======
    console.log('\n【Step 3】测试成语刷新功能...');
    const refreshBtn = page.locator('button:has-text("换一批")');
    assert(await refreshBtn.count() > 0, '换一批按钮存在');

    // 点击换一批，需要有正常响应
    await refreshBtn.click();
    await page.waitForTimeout(2000);
    // 刷新按钮不应导致崩溃
    const pageOk = await page.locator('text=任务队列').count() > 0;
    assert(pageOk, '换一批后页面仍然正常');

    // ====== Step 4: 品类切换测试 ======
    console.log('\n【Step 4】测试品类切换...');
    // 点击古诗 Tab
    const tabsAreaStep4 = page.locator('.border-b.border-gray-200');
    const poetryTabBtn = tabsAreaStep4.locator('button:has-text("古诗")');
    if (await poetryTabBtn.count() > 0) {
      await poetryTabBtn.click();
      await page.waitForTimeout(1000);
      // 检查内容选择区域是否更新
      const poetryContent = await page.locator('text=选择古诗').count() > 0;
      assert(poetryContent, '切换到古诗品类后，内容选择区域显示"选择古诗"');

      // 切换回成语
      const idiomTabBtn = tabsAreaStep4.locator('button:has-text("成语")');
      await idiomTabBtn.click();
      await page.waitForTimeout(2000);
    }

    // ====== Step 5: 选中成语后开始生成 ======
    console.log('\n【Step 5】测试选中成语后开始生成...');
    // 等待内容列表加载，点击第一个可见的成语按钮
    await page.waitForTimeout(2000);
    const contentGrid = page.locator('.grid-cols-5 button').first();
    const gridCount = await page.locator('.grid-cols-5 button').count();
    assert(gridCount > 0, `内容选择列表有 ${gridCount} 个条目`);

    if (gridCount > 0) {
      await contentGrid.click();
      await page.waitForTimeout(500);
    }

    // 检查开始按钮是否启用
    const startBtnAfterSelect = page.locator('button:has-text("开始生成")');
    const isEnabledAfterSelect = !(await startBtnAfterSelect.isDisabled());
    assert(isEnabledAfterSelect, '选中成语后开始按钮已启用');

    // ====== Step 6: 阅读预生成绘本 ======
    console.log('\n【Step 6】测试阅读预生成绘本...');
    // 直接访问叶公好龙的预生成绘本
    await page.goto(`${BASE_URL}/read/idiom:叶公好龙`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    const readPageTitle = await page.title();
    console.log(`  阅读页标题: "${readPageTitle}"`);

    // 检查阅读页核心元素
    const hasBookContent = await page.locator('text=叶公好龙').count() > 0 ||
      await page.locator('text=BookViewer').count() > 0 ||
      await page.locator('text=返回').count() > 0 ||
      await page.locator('text=PDF').count() > 0;
    assert(hasBookContent, '阅读页面有绘本内容');

    // 检查翻页按钮
    const nextBtn = page.locator('button:has-text("▶")').first();
    const prevBtn = page.locator('button:has-text("◀")').first();
    const hasNav = await nextBtn.count() > 0 || await prevBtn.count() > 0;
    assert(hasNav, '阅读页有翻页按钮');

    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      console.log('  点击下一页 ✅');
    }

    if (await prevBtn.count() > 0) {
      await prevBtn.click();
      await page.waitForTimeout(500);
      console.log('  点击上一页 ✅');
    }

    // 检查 PDF 导出按钮
    const hasPdf = await page.locator('text=PDF').count() > 0;
    assert(hasPdf, '阅读页有 PDF 导出按钮');

    // 检查 TTS 按钮
    const hasTts = await page.locator('text=朗读').count() > 0 ||
      await page.locator('text=播放').count() > 0 ||
      await page.locator('text=Speak').count() > 0;
    assert(hasTts, '阅读页有 TTS 按钮');

    // ====== Step 7: 错误页面测试 ======
    console.log('\n【Step 7】测试错误页面...');
    await page.goto(`${BASE_URL}/read/nonexistent-book-12345`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(5000);

    const errorText = await page.locator('text=绘本未找到').count() > 0;
    const hasHomeLink = await page.locator('a:has-text("返回首页")').count() > 0;
    assert(errorText && hasHomeLink, '不存在的绘本显示错误页和返回按钮');

    // ====== 结果汇总 ======
    console.log('\n========================================');
    console.log(`测试完成！✅ ${passed} 通过, ❌ ${failed} 失败`);
    console.log('========================================');

    if (errors.length > 0) {
      console.log('\n失败详情:');
      errors.forEach((e, i) => console.log(`  ${i+1}. ${e}`));
    }

  } catch (error) {
    console.error('测试异常:', error.message);
    console.error('当前URL:', page.url());
    failed++;
  } finally {
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runE2ETest().catch(console.error);
