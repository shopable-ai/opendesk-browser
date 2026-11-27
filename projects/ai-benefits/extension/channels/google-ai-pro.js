export const googleAIPro = {
  id: 'google-ai-pro',
  name: 'Google AI Pro 个人会员',
  actions: [
    {
      id: 'purchase',
      label: '为目标个人 Google Account 购买',
      buttonLabel: '打开 Google One 官方购买入口（不会付款）',
      url: 'https://one.google.com/',
      outcome: 'personal-subscription',
      notice: '购买绑定当前 Google Account。请在官方页面核对账号、国家/地区、套餐和支付方式。',
      confirmer: '目标账号用户核对账号；付款人确认官方结账。',
      evidence: 'Google AI Pro membership'
    },
    {
      id: 'family-share',
      label: '通过 Google One 家庭组共享部分 AI 权益',
      buttonLabel: '打开 Google One 家庭共享（不会发邀请）',
      url: 'https://one.google.com/',
      outcome: 'family-share',
      notice: '家庭管理员付款并开启共享；目标成员必须满足同国家、个人 Google Account、单一家庭组及过去 12 个月未加入其他家庭组等资格。仅部分 AI 权益共享。',
      confirmer: '家庭管理员开启共享/发邀请；目标成员接受加入。',
      evidence: 'Google One family sharing'
    }
  ]
};
