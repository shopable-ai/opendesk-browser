export const chatgptBusiness = {
  id: 'chatgpt-business',
  name: 'ChatGPT Business 席位',
  actions: [
    {
      id: 'invite-member',
      label: '邀请指定团队成员',
      buttonLabel: '打开 ChatGPT Business 成员管理（不会邀请）',
      url: 'https://chatgpt.com/',
      outcome: 'business-seat',
      notice: '邀请不会购买或预留席位；只有目标成员接受时才检查席位可用性。无席位时需要 Owner 购买或提供席位。R1 不启用可能自动购席的 auto-join。',
      confirmer: 'Workspace Admin / Owner 发起邀请；目标成员接受；需要新增席位时由 Owner 购买。',
      evidence: 'ChatGPT Business seats'
    }
  ]
};
