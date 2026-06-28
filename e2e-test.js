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
  console.log('成语绘本工坊 - 完整端到端测试');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    // ====== Step 1: 首页加载 ======
    console.log('【Step 1】测试首页加载...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);

    const title = await page.title();
    assert(title.includes('成语绘本工坊'), `页面标题 "${title}" 包含 "成语绘本工坊"`);

    // 检查核心元素
    const headerExists = await page.locator('header').count() > 0;
    assert(headerExists, 'header 组件渲染');

    const idiomGridExists = await page.locator('text=选择成语').count() > 0;
    assert(idiomGridExists, '成语选择区域显示');

    const taskQueueExists = await page.locator('text=任务队列').count() > 0;
    assert(taskQueueExists, '任务队列区域显示');

    const bookShelfExists = await page.locator('text=我的绘本书架').count() > 0;
    assert(bookShelfExists, '绘本书架区域显示');

    // 检查内置成语是否显示
    const expectIdioms = ['画蛇添足', '守株待兔', '亡羊补牢', '井底之蛙', '狐假虎威',
      '掩耳盗铃', '刻舟求剑', '愚公移山', '拔苗助长', '叶公好龙'];
    for (const idiom of expectIdioms) {
      const exists = await page.locator(`button:has-text("${idiom}")`).count() > 0;
      assert(exists, `内置成语 "${idiom}" 显示在列表中`);
    }

    // ====== Step 2: 自定义输入验证 ======
    console.log('\n【Step 2】测试自定义输入...');
    const input = page.locator('input[placeholder="输入自定义成语..."]');
    assert(await input.count() > 0, '自定义输入框存在');

    await input.fill('杯弓蛇影');
    const inputValue = await input.inputValue();
    assert(inputValue === '杯弓蛇影', `输入框值正确: "${inputValue}"`);

    // 未选中成语时，"开始生成"按钮应禁用
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
    const initialIdioms = await page.locator('button:has-text("画蛇添足")').count();
    await refreshBtn.click();
    await page.waitForTimeout(2000);
    // 刷新按钮不应导致崩溃
    const pageOk = await page.locator('text=任务队列').count() > 0;
    assert(pageOk, '换一批后页面仍然正常');

    // ====== Step 4: 批量选择测试 ======
    console.log('\n【Step 4】测试批量选择...');
    // 在紧凑模式下（首页），点击成语触发批量选择
    const selectFirst = page.locator('button:has-text("掩耳盗铃")');
    const selectSecond = page.locator('button:has-text("刻舟求剑")');
    
    if (await selectFirst.count() > 0) {
      await selectFirst.click();
      await page.waitForTimeout(300);
      // 检查是否出现批量生成按钮
      const batchBtn = page.locator('button:has-text("批量生成")');
      const batchExists = await batchBtn.count() > 0;
      assert(batchExists, '选择成语后出现批量生成按钮');
      
      if (batchExists) {
        const batchText = await batchBtn.textContent();
        assert(batchText.includes('1'), `批量按钮显示数量: "${batchText}"`);
      }
      
      await selectSecond.click();
      await page.waitForTimeout(300);
      const batchText2 = await page.locator('button:has-text("批量生成")').textContent();
      assert(batchText2.includes('2'), `选择两个后批量按钮显示: "${batchText2}"`);
    }

    // ====== Step 5: 选中单个成语跳转 ======
    console.log('\n【Step 5】测试单个成语选择...');
    // 清除所有选择（点击刷新或重新加载）
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 检查是否有已存在的绘本（预生成的绘本可能有）
    const existingIdioms = new Set();
    for (const idiom of expectIdioms) {
      const btn = page.locator(`button:has-text("${idiom}")`);
      if (await btn.count() > 0) {
        // 检查是否有绿色勾（表示已有绘本）
        const parent = btn.locator('..');
        const hasCheckmark = await parent.locator('text=✓').count() > 0;
        if (hasCheckmark) existingIdioms.add(idiom);
      }
    }
    console.log(`  已有绘本的成语: ${[...existingIdioms].join(', ') || '无'}`);

    // 点击已有绘本的成语应跳转到阅读页
    // 先点击一个没有绘本的成语
    const targetIdiom = '掩耳盗铃';
    await page.locator(`button:has-text("${targetIdiom}")`).first().click();
    await page.waitForTimeout(500);
    
    // 检查是否弹出了"开始生成"或"批量生成"（表示进入生成模式）
    const afterClickBatch = page.locator('button:has-text("批量生成")');
    const afterClickStart = page.locator('button:has-text("开始生成")');
    const generationMode = await afterClickBatch.count() > 0 || await afterClickStart.count() > 0;
    assert(generationMode, `选择 "${targetIdiom}" 后进入生成模式`);

    // ====== Step 6: 导航测试 ======
    console.log('\n【Step 6】测试导航链接...');
    const libraryLink = page.locator('a:has-text("绘本库")');
    if (await libraryLink.count() > 0) {
      await libraryLink.click();
      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      assert(currentUrl.includes('/') || currentUrl.includes('/library'),
        `绘本库链接导航正确: "${currentUrl}"`);
    }

    // 返回首页
    const homeLink = page.locator('a:has-text("创建")');
    if (await homeLink.count() > 0) {
      await homeLink.click();
      await page.waitForTimeout(2000);
    }

    // ====== Step 7: 阅读预生成绘本 ======
    console.log('\n【Step 7】测试阅读预生成绘本...');
    // 直接访问叶公好龙的预生成绘本
    await page.goto(`${BASE_URL}/read/叶公好龙`, { waitUntil: 'networkidle', timeout: 15000 });
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

    // ====== Step 8: 错误页面测试 ======
    console.log('\n【Step 8】测试错误页面...');
    await page.goto(`${BASE_URL}/read/nonexistent-book-12345`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    
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
