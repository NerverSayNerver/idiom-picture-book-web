/**
 * 批量生成20个成语绘本
 * 
 * 使用方法：
 * node scripts/batch-generate.js
 * 
 * 此脚本会调用 Agnes API 生成20个成语绘本的数据和图像，
 * 并保存为 JSON 文件，供前端加载到 IndexedDB。
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.AGNES_API_KEY || 'sk-blCDCRpxzjWnPTi0mOpdZqUJcwV0A0EDNHuXbViQ1Mz8fGfM';
const API_BASE = 'https://apihub.agnes-ai.com/v1';

// 20个常用成语
const IDIOM_LIST = [
  '画蛇添足', '守株待兔', '亡羊补牢', '井底之蛙', '狐假虎威',
  '掩耳盗铃', '刻舟求剑', '愚公移山', '拔苗助长', '叶公好龙',
  '对牛弹琴', '杯弓蛇影', '破釜沉舟', '卧薪尝胆', '望梅止渴',
  '纸上谈兵', '指鹿为马', '完璧归赵', '负荆请罪', '闻鸡起舞'
];

// 简化的场景模板（每个成语3个场景，加快生成速度）
const SCENE_TEMPLATES = {
  '画蛇添足': [
    { title: '画蛇比赛', prompt: 'A group of people drawing snakes on paper, cartoon style, competition scene', narration: '从前有几个人比赛画蛇，看谁画得快。' },
    { title: '添足之人', prompt: 'A person proudly adding feet to a snake drawing, cartoon style, funny scene', narration: '有个人画完了蛇，还给蛇添上了脚。' },
    { title: '比赛失败', prompt: 'A person looking sad while others celebrate, cartoon style, lesson learned', narration: '结果他反而输了比赛，多此一举反而不好。' }
  ],
  '守株待兔': [
    { title: '兔子撞树', prompt: 'A rabbit running into a tree stump, cartoon style, farm background', narration: '有一天，一只兔子撞到树桩上死了。' },
    { title: '农夫等待', prompt: 'A lazy farmer sitting by a tree stump waiting, cartoon style, sunny day', narration: '农夫从此每天坐在树桩旁等兔子。' },
    { title: '田地荒芜', prompt: 'An overgrown field with a sad farmer, cartoon style, lesson scene', narration: '结果田地都荒芜了，再也没有兔子来。' }
  ],
  '亡羊补牢': [
    { title: '羊圈破洞', prompt: 'A sheep pen with a hole, a wolf watching nearby, cartoon style, night scene', narration: '羊圈破了个洞，狼趁机偷走了几只羊。' },
    { title: '修补羊圈', prompt: 'A shepherd fixing the fence of sheep pen, cartoon style, determined expression', narration: '邻居劝他赶快修补羊圈。' },
    { title: '羊群安全', prompt: 'A happy shepherd with safe sheep in a repaired pen, cartoon style, happy ending', narration: '他修好羊圈后，再也没有丢过羊。' }
  ],
  '井底之蛙': [
    { title: '青蛙在井底', prompt: 'A frog sitting at the bottom of a well looking up, cartoon style, limited view', narration: '有一只青蛙住在井底，觉得天只有井口那么大。' },
    { title: '海龟来访', prompt: 'A sea turtle talking to a frog at a well, cartoon style, conversation scene', narration: '海龟告诉它大海有多广阔。' },
    { title: '青蛙惊讶', prompt: 'A surprised frog learning about the big world, cartoon style, eye-opening moment', narration: '青蛙听了非常惊讶，原来世界这么大！' }
  ],
  '狐假虎威': [
    { title: '狐狸骑虎', prompt: 'A fox riding on the back of a tiger, cartoon style, forest scene', narration: '狐狸骑在老虎背上，在森林里走。' },
    { title: '动物害怕', prompt: 'Forest animals running away in fear, cartoon style, dramatic scene', narration: '其他动物看到都吓得逃跑。' },
    { title: '真相大白', prompt: 'A tiger looking angry at a scared fox, cartoon style, reveal moment', narration: '老虎发现真相后，狐狸再也不敢骗人了。' }
  ],
  '掩耳盗铃': [
    { title: '看到铃铛', prompt: 'A person eyeing a beautiful bell, cartoon style, sneaky expression', narration: '有个人想偷别人家的铃铛。' },
    { title: '捂住耳朵', prompt: 'A person covering own ears while reaching for a bell, cartoon style, funny scene', narration: '他捂住自己的耳朵去偷铃铛。' },
    { title: '被人发现', prompt: 'A person caught stealing, looking embarrassed, cartoon style, lesson learned', narration: '结果还是被人发现了，自欺欺人是不行的。' }
  ],
  '刻舟求剑': [
    { title: '剑掉入水中', prompt: 'A sword falling from a boat into a river, cartoon style, splash scene', narration: '有个人坐船时，剑掉进了水里。' },
    { title: '在船上刻记号', prompt: 'A person carving a mark on the boat, cartoon style, river journey', narration: '他在船上刻了个记号，想等船停了再找。' },
    { title: '找不到剑', prompt: 'A confused person searching in water at a dock, cartoon style, realization', narration: '船已经走了，剑却还在原来的地方，他当然找不到了。' }
  ],
  '愚公移山': [
    { title: '愚公决心', prompt: 'An old man determined to move mountains, cartoon style, mountain background', narration: '愚公年纪很大了，但他决心要移走门前的两座大山。' },
    { title: '全家人挖山', prompt: 'A whole family digging at a mountain, cartoon style, teamwork scene', narration: '他带领全家人一起挖山不止。' },
    { title: '山神感动', prompt: 'Mountain gods moved by determination, helping to move mountains, cartoon style', narration: '他的精神感动了天神，帮他把山搬走了。' }
  ],
  '拔苗助长': [
    { title: '禾苗生长', prompt: 'Seedlings growing in a rice field, cartoon style, patient farmer', narration: '有个农夫种了禾苗，希望它们快点长高。' },
    { title: '拔高禾苗', prompt: 'A farmer pulling seedlings to make them taller, cartoon style, bad idea', narration: '他把禾苗一棵棵往上拔，想让它们长快点。' },
    { title: '禾苗枯萎', prompt: 'Wilted seedlings in a field with a sad farmer, cartoon style, lesson learned', narration: '结果禾苗全都枯死了，急于求成反而坏事。' }
  ],
  '叶公好龙': [
    { title: '叶公爱龙', prompt: 'A nobleman surrounded by dragon decorations, cartoon style, fancy room', narration: '叶公非常喜欢龙，家里到处都是龙的装饰。' },
    { title: '真龙降临', prompt: 'A real dragon appearing at the window, cartoon style, magical scene', narration: '有一天，一条真龙听说了，就来拜访他。' },
    { title: '叶公惊恐', prompt: 'A scared nobleman hiding under a table from a dragon, cartoon style, funny scene', narration: '叶公吓得躲到桌子底下，原来他并不是真的喜欢龙。' }
  ],
  '对牛弹琴': [
    { title: '音乐家弹琴', prompt: 'A musician playing music to a cow, cartoon style, farm background', narration: '有个音乐家对着牛弹奏美妙的音乐。' },
    { title: '牛不理会', prompt: 'A cow eating grass ignoring the musician, cartoon style, funny scene', narration: '可是牛只顾着吃草，根本不听。' },
    { title: '恍然大悟', prompt: 'A musician realizing the cow cannot appreciate music, cartoon style, lesson learned', narration: '他这才明白，对不懂的人讲道理是没有用的。' }
  ],
  '杯弓蛇影': [
    { title: '看到蛇影', prompt: 'A person seeing a snake shadow in their wine cup, cartoon style, scared expression', narration: '有个人喝酒时，看到杯中有蛇的影子。' },
    { title: '疑心生病', prompt: 'A person in bed sick from worry, cartoon style, worried scene', narration: '他疑心很重，回家后就生病了。' },
    { title: '真相大白', prompt: 'A person relieved after discovering it was just a bow reflection, cartoon style', narration: '后来发现那只是弓的倒影，他的病立刻就好了。' }
  ],
  '破釜沉舟': [
    { title: '砸破锅碗', prompt: 'An army breaking their cooking pots, cartoon style, war preparation', narration: '将军命令砸破锅碗，表示决一死战。' },
    { title: '沉没船只', prompt: 'An army sinking their boats at the river, cartoon style, determined soldiers', narration: '又把船只沉入河中，断绝退路。' },
    { title: '英勇胜利', prompt: 'An army winning a great battle, cartoon style, victory celebration', narration: '士兵们奋勇作战，最终取得了胜利。' }
  ],
  '卧薪尝胆': [
    { title: '战败受辱', prompt: 'A defeated king sleeping on firewood, cartoon style, suffering scene', narration: '越王勾践战败后，每天睡在柴草上。' },
    { title: '尝苦胆', prompt: 'A king tasting bitter gall bladder, cartoon style, determination scene', narration: '他每天尝苦胆，提醒自己不要忘记耻辱。' },
    { title: '最终复仇', prompt: 'A king leading his army to victory, cartoon style, triumphant scene', narration: '经过多年努力，他终于打败了敌人，报了仇。' }
  ],
  '望梅止渴': [
    { title: '行军口渴', prompt: 'An army marching in hot sun, thirsty soldiers, cartoon style, desert scene', narration: '曹操带兵行军，士兵们都很口渴。' },
    { title: '说起梅子', prompt: 'A general talking about sour plums to soldiers, cartoon style, clever trick', narration: '曹操说前面有梅林，梅子又酸又甜。' },
    { title: '士兵流涎', prompt: 'Soldiers imagining plums and feeling less thirsty, cartoon style, imagination scene', narration: '士兵们想到梅子，口水都流出来了，也不那么渴了。' }
  ],
  '纸上谈兵': [
    { title: '熟读兵书', prompt: 'A young general reading military books, cartoon style, study scene', narration: '赵括熟读兵书，谈论军事头头是道。' },
    { title: '上战场', prompt: 'An inexperienced general leading army to battle, cartoon style, war scene', narration: '他当上将军后，却只会纸上谈兵。' },
    { title: '惨遭失败', prompt: 'An army defeated in battle, cartoon style, lesson learned', narration: '结果在实战中惨败，只会理论是不够的。' }
  ],
  '指鹿为马': [
    { title: '指着鹿', prompt: 'A minister pointing at a deer, cartoon style, court scene', narration: '赵高牵来一只鹿，对皇帝说是马。' },
    { title: '大臣争论', prompt: 'Court officials arguing about deer or horse, cartoon style, political scene', narration: '大臣们有的说是鹿，有的附和说是马。' },
    { title: '忠臣被害', prompt: 'Honest officials being punished, cartoon style, dark scene', narration: '说是鹿的忠臣后来都被赵高害死了。' }
  ],
  '完璧归赵': [
    { title: '蔺相如出使', prompt: 'An envoy traveling with a precious jade, cartoon style, diplomatic mission', narration: '蔺相如带着和氏璧出使秦国。' },
    { title: '秦王耍赖', prompt: 'A king trying to keep the jade without giving cities, cartoon style, tense scene', narration: '秦王想白白得到宝玉，不肯给城池。' },
    { title: '完璧归赵', prompt: 'An envoy safely returning with the jade, cartoon style, triumphant return', narration: '蔺相如机智勇敢，终于把宝玉完好带回赵国。' }
  ],
  '负荆请罪': [
    { title: '廉颇不服', prompt: 'A general angry at being outranked, cartoon style, pride scene', narration: '廉颇觉得自己功劳大，不服蔺相如。' },
    { title: '蔺相如避让', prompt: 'A wise minister avoiding conflict, cartoon style, humble scene', narration: '蔺相如为了国家大局，处处避让廉颇。' },
    { title: '负荆请罪', prompt: 'A general carrying thorns to apologize, cartoon style, reconciliation scene', narration: '廉颇深受感动，背着荆条去请罪，两人成为好友。' }
  ],
  '闻鸡起舞': [
    { title: '听到鸡叫', prompt: 'A young man waking up to rooster crowing, cartoon style, dawn scene', narration: '祖逖听到鸡叫就起床练剑。' },
    { title: '刻苦练剑', prompt: 'A young man practicing sword in the early morning, cartoon style, training scene', narration: '他每天天不亮就起来刻苦练武。' },
    { title: '成为名将', prompt: 'A brave general leading army to victory, cartoon style, achievement scene', narration: '后来他成为了一名英勇的将军，保卫国家。' }
  ]
};

// 简化版场景描述（中文）
const SCENE_DESCRIPTIONS = {
  '画蛇添足': ['众人比赛画蛇', '有人给蛇添脚', '反而输掉比赛'],
  '守株待兔': ['兔子撞树而死', '农夫天天等待', '田地荒芜'],
  '亡羊补牢': ['羊圈破洞丢羊', '修补羊圈', '不再丢羊'],
  '井底之蛙': ['青蛙在井底', '海龟说大海', '青蛙惊讶'],
  '狐假虎威': ['狐狸骑老虎', '动物都害怕', '老虎发现真相'],
  '掩耳盗铃': ['看到铃铛', '捂耳偷铃', '被人发现'],
  '刻舟求剑': ['剑掉入水中', '船上刻记号', '找不到剑'],
  '愚公移山': ['决心移山', '全家挖山', '天神帮忙'],
  '拔苗助长': ['禾苗生长', '往上拔苗', '禾苗枯萎'],
  '叶公好龙': ['到处是龙装饰', '真龙来访', '吓得躲起来'],
  '对牛弹琴': ['对牛弹琴', '牛不理会', '恍然大悟'],
  '杯弓蛇影': ['杯中蛇影', '疑心生病', '发现是弓影'],
  '破釜沉舟': ['砸破锅碗', '沉没船只', '英勇胜利'],
  '卧薪尝胆': ['睡柴草上', '每天尝胆', '最终复仇'],
  '望梅止渴': ['行军口渴', '说起梅林', '士兵流涎'],
  '纸上谈兵': ['熟读兵书', '上战场', '惨遭失败'],
  '指鹿为马': ['指鹿为马', '大臣争论', '忠臣被害'],
  '完璧归赵': ['出使秦国', '秦王耍赖', '完璧归赵'],
  '负荆请罪': ['廉颇不服', '蔺相如避让', '负荆请罪'],
  '闻鸡起舞': ['听到鸡叫', '刻苦练剑', '成为名将']
};

const MEANINGS = {
  '画蛇添足': '比喻做多余的事，反而不恰当',
  '守株待兔': '比喻不主动努力，希望得到意外收获',
  '亡羊补牢': '比喻出了问题以后想办法补救',
  '井底之蛙': '比喻见识狭隘、目光短浅的人',
  '狐假虎威': '比喻仰仗别人的权势来欺压人',
  '掩耳盗铃': '比喻自己欺骗自己',
  '刻舟求剑': '比喻拘泥于成法，不知变通',
  '愚公移山': '比喻坚持不懈地改造自然',
  '拔苗助长': '比喻违反客观规律，急于求成',
  '叶公好龙': '比喻自称爱好某事物，其实并不是真爱好',
  '对牛弹琴': '比喻对不懂道理的人讲道理',
  '杯弓蛇影': '比喻因疑神疑鬼而引起恐惧',
  '破釜沉舟': '比喻下定决心，不留退路',
  '卧薪尝胆': '比喻刻苦自励，发愤图强',
  '望梅止渴': '比喻用空想来安慰自己',
  '纸上谈兵': '比喻空谈理论，不能解决实际问题',
  '指鹿为马': '比喻颠倒黑白，混淆是非',
  '完璧归赵': '比喻把原物完好地归还本人',
  '负荆请罪': '表示向人认错赔罪',
  '闻鸡起舞': '比喻有志报国的人及时奋起'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateImage(prompt) {
  const truncatedPrompt = prompt.length > 300 ? prompt.substring(0, 300) : prompt;

  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(`${API_BASE}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'agnes-image-2.1-flash',
          prompt: truncatedPrompt,
          size: '512x512'
        })
      });

      if (response.ok) {
        const data = await response.json();
        return data.data[0]?.url;
      }

      console.log(`  重试 ${i + 1}/5...`);
      await sleep(3000 * (i + 1));
    } catch (err) {
      console.log(`  错误: ${err.message}`);
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

async function generateBook(idiom, index) {
  console.log(`\n[${index + 1}/20] 生成: ${idiom}`);

  const templates = SCENE_TEMPLATES[idiom];
  const descriptions = SCENE_DESCRIPTIONS[idiom];
  const meaning = MEANINGS[idiom];

  const scenes = [];

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    console.log(`  场景 ${i + 1}: ${template.title}`);

    const imageUrl = await generateImage(template.prompt);

    scenes.push({
      id: i + 1,
      title: template.title,
      description: descriptions[i],
      prompt: template.prompt,
      narration: template.narration,
      imageUrl: imageUrl || ''
    });

    await sleep(1000);
  }

  return {
    id: `book-${Date.now()}-${index}`,
    title: idiom,
    idiom: idiom,
    meaning: meaning,
    createdAt: new Date().toISOString(),
    scenes: scenes
  };
}

async function main() {
  console.log('========================================');
  console.log('批量生成20个成语绘本');
  console.log('========================================\n');

  const outputDir = path.join(__dirname, '..', 'public', 'pre-generated');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const books = [];

  for (let i = 0; i < IDIOM_LIST.length; i++) {
    const idiom = IDIOM_LIST[i];
    const book = await generateBook(idiom, i);
    books.push(book);

    // 保存单个绘本
    const filename = `${idiom}.json`;
    fs.writeFileSync(
      path.join(outputDir, filename),
      JSON.stringify(book, null, 2),
      'utf-8'
    );
    console.log(`  ✅ 保存: ${filename}`);

    // 每5个成语暂停一下
    if ((i + 1) % 5 === 0) {
      console.log(`\n--- 已完成 ${i + 1}/20 ---\n`);
      await sleep(5000);
    }
  }

  // 保存索引文件
  const indexData = books.map(b => ({
    id: b.id,
    title: b.title,
    idiom: b.idiom,
    meaning: b.meaning,
    createdAt: b.createdAt,
    sceneCount: b.scenes.length
  }));

  fs.writeFileSync(
    path.join(outputDir, 'index.json'),
    JSON.stringify(indexData, null, 2),
    'utf-8'
  );

  console.log('\n========================================');
  console.log('批量生成完成！');
  console.log(`共生成 ${books.length} 本绘本`);
  console.log(`保存位置: ${outputDir}`);
  console.log('========================================');
}

main().catch(console.error);
