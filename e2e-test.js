const { chromium } = require('playwright');

async function runE2ETest() {
  console.log('========================================');
  console.log('成语绘本工坊 - 浏览器端到端测试');
  console.log('========================================\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // ====== Step 1: 测试首页 ======
    console.log('【Step 1】测试首页...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);  // 等待 React hydration

    const pageContent = await page.content();
    const hasTitle = pageContent.includes('成语绘本工坊');
    const hasIdioms = pageContent.includes('叶公好龙');

    console.log('  标题渲染:', hasTitle ? '✅' : '❌');
    console.log('  成语列表:', hasIdioms ? '✅' : '❌');

    // ====== Step 2: 选择成语并生成 ======
    console.log('\n【Step 2】选择叶公好龙并开始生成...');

    await page.click('button:has-text("叶公好龙")');
    await page.waitForTimeout(1000);

    const startButton = page.locator('button:has-text("开始生成绘本")');
    const isDisabled = await startButton.evaluate(el => el.disabled);
    console.log('  按钮状态:', !isDisabled ? '✅ 已启用' : '❌ 未启用');

    if (!isDisabled) {
      await startButton.click();
      await page.waitForTimeout(2000);

      const currentUrl = page.url();
      console.log('  跳转页面:', currentUrl.includes('/generate') ? '✅ 生成页' : '❌ ' + currentUrl);

      // ====== Step 3: 等待生成完成 ======
      if (currentUrl.includes('/generate')) {
        console.log('\n【Step 3】等待生成完成...');

        // 等待 LLM 拆分
        await page.waitForTimeout(10000);

        // 等待图像生成完成（最多3分钟）
        let completed = false;
        for (let i = 0; i < 60; i++) {
          await page.waitForTimeout(3000);

          const url = page.url();
          if (url.includes('/read/')) {
            completed = true;
            console.log('  生成完成，跳转到阅读页: ✅');
            break;
          }

          if (i % 5 === 0) {
            const content = await page.content();
            const completedCount = (content.match(/已完成/g) || []).length;
            const errorCount = (content.match(/错误|失败/g) || []).length;
            if (errorCount > 0) {
              console.log('  ❌ 检测到错误');
              break;
            }
            if (completedCount > 0) {
              console.log('  进度: 已完成 ' + completedCount + ' 个场景');
            }
          }
        }

        // ====== Step 4: 测试阅读页 ======
        if (page.url().includes('/read/')) {
          console.log('\n【Step 4】测试阅读页...');
          await page.waitForTimeout(2000);

          const readContent = await page.content();
          console.log('  绘本标题:', readContent.includes('叶公好龙') ? '✅' : '❌');
          console.log('  翻页按钮:', readContent.includes('▶') ? '✅' : '❌');
          console.log('  PDF 按钮:', readContent.includes('PDF') ? '✅' : '❌');

          // 测试翻页
          console.log('\n【Step 5】测试翻页功能...');
          const nextBtn = page.locator('button:has-text("▶")').first();
          if (await nextBtn.count() > 0) {
            await nextBtn.click();
            await page.waitForTimeout(500);
            console.log('  点击下一页: ✅');
          }

          const prevBtn = page.locator('button:has-text("◀")').first();
          if (await prevBtn.count() > 0) {
            await prevBtn.click();
            await page.waitForTimeout(500);
            console.log('  点击上一页: ✅');
          }
        } else {
          console.log('  ⚠️ 未跳转到阅读页');
        }
      }
    }

    // ====== 总结 ======
    console.log('\n========================================');
    console.log('浏览器端到端测试完成！');
    console.log('========================================');

  } catch (error) {
    console.error('测试出错:', error.message);
    console.error('当前URL:', page.url());
  } finally {
    await browser.close();
  }
}

runE2ETest().catch(console.error);
