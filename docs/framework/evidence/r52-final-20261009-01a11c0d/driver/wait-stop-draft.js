async function main(){await page.getByText('THIS_STATUS_NEVER_EXISTS',{exact:true}).waitFor({timeout:60000});await page.locator('#redraw').click();return 'must-not-complete'}
