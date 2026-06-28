import type { ContentInfo } from './types'

// 各品类内置推荐列表
export const IDIOM_LIST: ContentInfo[] = [
  { sourceText: '画蛇添足', meaning: '比喻做多余的事，反而不恰当', category: 'idiom' },
  { sourceText: '守株待兔', meaning: '比喻不主动努力，希望得到意外收获', category: 'idiom' },
  { sourceText: '亡羊补牢', meaning: '比喻出了问题以后想办法补救', category: 'idiom' },
  { sourceText: '井底之蛙', meaning: '比喻见识狭隘、目光短浅的人', category: 'idiom' },
  { sourceText: '狐假虎威', meaning: '比喻仰仗别人的权势来欺压人', category: 'idiom' },
  { sourceText: '掩耳盗铃', meaning: '比喻自己欺骗自己', category: 'idiom' },
  { sourceText: '刻舟求剑', meaning: '比喻拘泥于成法，不知变通', category: 'idiom' },
  { sourceText: '愚公移山', meaning: '比喻坚持不懈地改造自然', category: 'idiom' },
  { sourceText: '拔苗助长', meaning: '比喻违反客观规律，急于求成', category: 'idiom' },
  { sourceText: '叶公好龙', meaning: '比喻自称爱好某事物，其实并不是真爱好', category: 'idiom' },
]

export const POETRY_LIST: ContentInfo[] = [
  { sourceText: '静夜思', meaning: '诗人在安静的夜晚思念家乡', category: 'poetry', author: '李白', dynasty: '唐', fullText: '床前明月光，疑是地上霜。举头望明月，低头思故乡。' },
  { sourceText: '春晓', meaning: '春天的早晨，鸟儿歌唱，风雨过后花落多少', category: 'poetry', author: '孟浩然', dynasty: '唐', fullText: '春眠不觉晓，处处闻啼鸟。夜来风雨声，花落知多少。' },
  { sourceText: '咏鹅', meaning: '描写白鹅在水中游动的可爱姿态', category: 'poetry', author: '骆宾王', dynasty: '唐', fullText: '鹅，鹅，鹅，曲项向天歌。白毛浮绿水，红掌拨清波。' },
  { sourceText: '悯农', meaning: '农民辛苦劳作，粮食来之不易', category: 'poetry', author: '李绅', dynasty: '唐', fullText: '锄禾日当午，汗滴禾下土。谁知盘中餐，粒粒皆辛苦。' },
  { sourceText: '登鹳雀楼', meaning: '想要看得更远，就要站得更高', category: 'poetry', author: '王之涣', dynasty: '唐', fullText: '白日依山尽，黄河入海流。欲穷千里目，更上一层楼。' },
  { sourceText: '江雪', meaning: '天寒地冻的江面上，老渔翁独自垂钓', category: 'poetry', author: '柳宗元', dynasty: '唐', fullText: '千山鸟飞绝，万径人踪灭。孤舟蓑笠翁，独钓寒江雪。' },
  { sourceText: '望庐山瀑布', meaning: '描写庐山瀑布的壮观景象', category: 'poetry', author: '李白', dynasty: '唐', fullText: '日照香炉生紫烟，遥看瀑布挂前川。飞流直下三千尺，疑是银河落九天。' },
  { sourceText: '绝句', meaning: '描绘春天生机勃勃的美丽景色', category: 'poetry', author: '杜甫', dynasty: '唐', fullText: '两个黄鹂鸣翠柳，一行白鹭上青天。窗含西岭千秋雪，门泊东吴万里船。' },
]

export const NURSERY_RHYME_LIST: ContentInfo[] = [
  { sourceText: '小兔子乖乖', meaning: '教导幼儿辨别陌生人、树立安全意识', category: 'nursery-rhyme', fullText: '小兔子乖乖，把门儿开开，快点儿开开，我要进来。\n不开不开我不开，妈妈没回来，谁来也不开。' },
  { sourceText: '两只老虎', meaning: '帮助幼儿认识身体部位，传递乐观包容', category: 'nursery-rhyme', fullText: '两只老虎，两只老虎，跑得快，跑得快。\n一只没有眼睛，一只没有尾巴，真奇怪，真奇怪。' },
  { sourceText: '小燕子', meaning: '描绘小燕子迁徙，培养对春天的喜爱', category: 'nursery-rhyme', fullText: '小燕子，穿花衣，年年春天来这里。\n我问燕子你为啥来？燕子说，这里的春天最美丽。' },
  { sourceText: '数鸭子', meaning: '学习数数，感受田园生活的乐趣', category: 'nursery-rhyme', fullText: '门前大桥下，游过一群鸭。\n快来快来数一数，二四六七八。\n嘎嘎嘎嘎真呀真多呀，数不清到底多少鸭。\n数不清到底多少鸭。' },
  { sourceText: '拔萝卜', meaning: '展现团队合作，齐心协力力量大', category: 'nursery-rhyme', fullText: '拔萝卜，拔萝卜，嗨吆嗨吆拔萝卜。\n嗨吆嗨吆拔不动，老太婆，快快来，快来帮我们拔萝卜。' },
  { sourceText: '小星星', meaning: '描绘夜空星星，培养安静入睡的习惯', category: 'nursery-rhyme', fullText: '一闪一闪亮晶晶，满天都是小星星。\n挂在天边放光明，好像许多小眼睛。\n一闪一闪亮晶晶，满天都是小星星。' },
]

export const PROVERB_LIST: ContentInfo[] = [
  { sourceText: '三个臭皮匠，顶个诸葛亮', meaning: '比喻人多智慧多，集思广益', category: 'proverb' },
  { sourceText: '路遥知马力，日久见人心', meaning: '时间长了才能看出人心的好坏', category: 'proverb' },
  { sourceText: '近朱者赤，近墨者黑', meaning: '接近好人变好，接近坏人变坏', category: 'proverb' },
  { sourceText: '千里送鹅毛，礼轻情意重', meaning: '礼物虽轻但情意深重', category: 'proverb' },
]

export const FAIRY_TALE_LIST: ContentInfo[] = [
  { sourceText: '三只小猪', meaning: '三只小猪盖房子，只有勤劳的老三躲过大灰狼', category: 'fairy-tale' },
  { sourceText: '小红帽', meaning: '小红帽去看外婆，路上遇到了大灰狼', category: 'fairy-tale' },
  { sourceText: '龟兔赛跑', meaning: '骄傲的兔子输给了坚持不懈的乌龟', category: 'fairy-tale' },
  { sourceText: '乌鸦喝水', meaning: '聪明的乌鸦用石子喝到了瓶底的水', category: 'fairy-tale' },
  { sourceText: '狼来了', meaning: '放羊的孩子说谎，最后没人相信他了', category: 'fairy-tale' },
]

// 按品类获取内置列表
export function getContentListByCategory(category: string): ContentInfo[] {
  switch (category) {
    case 'idiom': return IDIOM_LIST
    case 'poetry': return POETRY_LIST
    case 'nursery-rhyme': return NURSERY_RHYME_LIST
    case 'proverb': return PROVERB_LIST
    case 'fairy-tale': return FAIRY_TALE_LIST
    default: return []
  }
}

// 获取单品信息（在所有品类中查找）
export function getContentInfo(sourceText: string, category?: string): ContentInfo | undefined {
  const lists = category
    ? [getContentListByCategory(category)]
    : [IDIOM_LIST, POETRY_LIST, NURSERY_RHYME_LIST, PROVERB_LIST, FAIRY_TALE_LIST]
  for (const list of lists) {
    const found = list.find((item) => item.sourceText === sourceText)
    if (found) return found
  }
  return undefined
}
