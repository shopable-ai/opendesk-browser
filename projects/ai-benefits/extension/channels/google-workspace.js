export const googleWorkspace = {
  id: 'google-workspace-gemini',
  name: 'Google Workspace Gemini 席位',
  actions: [
    {
      id: 'assign-license',
      label: '为现有 Workspace 用户分配已购许可证',
      buttonLabel: '打开 Google Admin Console（不会分配席位）',
      url: 'https://admin.google.com/',
      outcome: 'workspace-license',
      notice: '必须先购买准确产品 SKU 并创建目标用户，再由有 License Management 权限的管理员分配。Enterprise License Manager API 只适用于租户已启用的 SKU；不能把个人 Google AI Pro 当作 Workspace 席位。',
      confirmer: 'Workspace 管理员确认分配；目标用户使用自己的组织账号。',
      evidence: 'Google Workspace Enterprise License Manager API'
    }
  ]
};
