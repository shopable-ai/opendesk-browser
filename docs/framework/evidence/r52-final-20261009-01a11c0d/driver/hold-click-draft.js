async function main(){await page.getByRole('dialog',{name:'设置面板',exact:true}).getByRole('button',{name:'同名',exact:true}).click({timeout:20000});return 'must-not-complete'}
