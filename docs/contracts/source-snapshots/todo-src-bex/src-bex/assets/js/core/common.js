
function createNotify(title,content){
    let desc = '';
    if (typeof content === 'string') desc =  content ;
    else if (typeof content === 'object') desc = content.body ;

    // console.log(title,desc);
    return callChromeBridgeInterface('CREATE_NOTIFY', { title, content: desc });
}
