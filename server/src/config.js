// 彩种元信息:号码范围、选取规则
export const LOTTERIES = {
  ssq: {
    key: 'ssq',
    name: '双色球',
    red: { label: '红球', count: 6, min: 1, max: 33 },
    blue: { label: '蓝球', count: 1, min: 1, max: 16 },
    // 官方数据接口
    apiUrl:
      'https://www.cwl.gov.cn/cwl_admin/front/cwlkj/search/kjxx/findDrawNotice?name=ssq&issueCount=&issueStart=&issueEnd=&dayStart=&dayEnd=&pageNo=1&pageSize={pageSize}&week=&systemType=PC',
  },
  dlt: {
    key: 'dlt',
    name: '大乐透',
    red: { label: '前区', count: 5, min: 1, max: 35 },
    blue: { label: '后区', count: 2, min: 1, max: 12 },
    apiUrl:
      'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry?gameNo=85&provinceId=0&pageSize={pageSize}&isVerify=1&pageNo=1',
  },
};

export const VALID_LOTTERIES = Object.keys(LOTTERIES);
