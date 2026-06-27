export interface IdiomInfo {
  idiom: string
  meaning: string
  category: string
}

export const IDIOM_LIST: IdiomInfo[] = [
  { idiom: '画蛇添足', meaning: '比喻做多余的事，反而不恰当', category: '寓言' },
  { idiom: '守株待兔', meaning: '比喻不主动努力，希望得到意外收获', category: '寓言' },
  { idiom: '亡羊补牢', meaning: '比喻出了问题以后想办法补救', category: '寓言' },
  { idiom: '井底之蛙', meaning: '比喻见识狭隘、目光短浅的人', category: '寓言' },
  { idiom: '狐假虎威', meaning: '比喻仰仗别人的权势来欺压人', category: '寓言' },
  { idiom: '掩耳盗铃', meaning: '比喻自己欺骗自己', category: '寓言' },
  { idiom: '刻舟求剑', meaning: '比喻拘泥于成法，不知变通', category: '寓言' },
  { idiom: '愚公移山', meaning: '比喻坚持不懈地改造自然', category: '励志' },
  { idiom: '拔苗助长', meaning: '比喻违反客观规律，急于求成', category: '寓言' },
  { idiom: '叶公好龙', meaning: '比喻自称爱好某事物，其实并不是真爱好', category: '寓言' },
]

export function getIdiomInfo(idiom: string): IdiomInfo | undefined {
  return IDIOM_LIST.find((item) => item.idiom === idiom)
}
