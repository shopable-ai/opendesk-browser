    var ignoreList = ['/README'] ; // ['/', '/index.html'];  //不自动播放的忽略页面，

    function insertAudio($container) {
        if( $container.find('#aplayer').length ) return ; //已添加。
        var audioWrap = `<div id='aplayer' class="player-wrap" style="height: 66px;border-radius: 6px;position: fixed;"></div>`;
        $container.prepend(audioWrap);
        
        player = new APlayer({
            container: document.getElementById('aplayer'),
            loop:'none',
            // mini: true,
            audio: [{
                name: '时间清单',
                artist: '待办任务',
                url: 'url.mp3',
                cover: 'http://h5.zhifm.cn/lib/todo8.png'
            }]
        });
        $btnStop = $('#btn-stop');
    }
    var player ,  $btnStop ,  currentMd5 , currentMp3Path , ready ,  queryT ,  inQury ,  isStop ,  finished ;
    player = null , $btnStop = null, currentMd5 = '', currentMp3Path = '', ready = false, queryT = null, inQury = false, isStop = false, finished = false;
    autoScrollState = localStorage.autoScrollState  == 'false' ? false : true ;

    var book_name = 'book_02';
    if( /^\/((\w|-){10,50})/.test(location.pathname)  ) book_name = location.pathname.match(/^\/((\w|-){10,50})/)[1] ;
    var bookdata;
    var $bookWrap = $(".markdown-section");
    var allowedNodeNames = ['H1', 'H2', 'H3', 'H4', 'H5', 'P'];

    var MAXLEN = 320;
    var patterns = [/\s*。\s*/, /\s*.\s*|\s*，\s*/];

    var $lastActiveEle = null;
    var currentChapter = "";
    var pathname = '' ; // location.pathname ;

    function check2AutoPlay(){
        //  , console.log('check2AutoPlay', $lastActiveEle.text().replace(/\n/g,'') ) 
        player && !player.paused && player.pause() , $bookWrap = $(".markdown-section") , $lastActiveEle = $bookWrap.children().first() ; //切换页面重新加载内容
        if( !localStorage.autoPlayPause ) readBook($(".markdown-section")) ;
    }

    function toNextChapter() {
        var $next = null;
        var $curchapter = $(".chapter.active");
        var $nextLevel = $curchapter.find("ul.articles");
        if ($nextLevel.length > 0) {
            $next = $nextLevel.find("li").eq(0);
        } else {
            $next = $curchapter.next();
            if ($next == null || $next.length == 0) {
                $next = $curchapter.parent().parent().next();
            }
        }

        if ($next == null || $next.length == 0) {
            console.log("本书已读完");
            return;
        } else {
            var $a = $next.find("a");
            while ($a == null || $a.length == 0 || $a.attr('href') == undefined) {
                $next = $next.next();
                if ($next == null || $next.length == 0) {
                    console.log("本书已读完2");
                    return;
                }
                $a = $next.find("a");
            }

            setTimeout(function() {
                location.href = $a.attr('href');
            }, 5000);
        }
    }

    function getCurrentChapter() {
        var $cur = $(".chapter.active");
        var $a = $cur.find("a");
        return $a.attr('href') + ' ' + $.trim($a.text());
    }

    function setCurrentActive($target) {
        $target.addClass('pactive');
        if ($lastActiveEle != null) {
            $lastActiveEle.removeClass('pactive');
        }
        $lastActiveEle = $target;
    }

    function doPlay(filename, mute) {
        console.log("开始播放：" + filename);
        // player.src = filename;
        player.list.remove(0);
        player.list.add({
                name: '时间清单',
                artist: '待办任务',
                url: filename,
                cover: 'http://h5.zhifm.cn/lib/todo8.png'
            })

        if(mute) return ; //翻页或刷新前如果已暂停就不播放。
        player.play();

        var $cactive = $(".pactive");
        if (autoScrollState && $cactive.length > 0) {
            $('html,body').animate({
                scrollTop: ($cactive.offset().top - 150) + 'px'
            }, 2000);
        }
    }

    function getNext() {
        var $next = $lastActiveEle.next();
        if ($next == null || $next.length == 0) {
            $next = $lastActiveEle.parent();
            if( !$next ) return ;
            console.log("to parent:", $next[0].nodeName);

            if ($next.hasClass('markdown-section')) {
                console.log(currentChapter, '本章已读完1');
                finished = true;
                return null;
            }
            while (true) {
                $next = $next.next();
                if ($next == null || $next.length == 0) {
                    $next = $next.parent();
                    console.log($next);
                    //console.log("to parent:", $next[0].nodeName);
                    if ($next && $next.length > 0 && $next.hasClass('markdown-section')) {
                        console.log(currentChapter, '本章已读完2');
                        finished = true;
                        return null;
                    }
                } else {
                    console.log("to next:", $next.text());
                    break;
                }
                /*if (allowedNodeNames.indexOf($next[0].nodeName) >= 0) {
                    break;
                }*/
            }
        }

        return $next;
    }
    function playEndListener() {
        console.log("下一段");
        //$(".pactive").text($(".pactive").text());
        $lastActiveEle.children().removeClass("pplaying");
        var $next = getNext();
        $next = formatParagraph($next);
        text2Sound($next);
    }
    function playingListener(){     //播放状态Doing
           delete localStorage.autoPlayPause ;
    }
    function pauseListener(){ //暂停状态Doing
         localStorage.autoPlayPause = true ;
    }


    function formatParagraph($p) {
        if( checkJump($p)  ) return $p ; //需要跳过的内容就不进入逻辑，
        var txt = $.trim($p.text());
        if (txt.length < MAXLEN) {
            return $p;
        } else {
            var ps = breakParagraph(txt, 0);
            console.log(ps);
            let px = ps.map(i=> '<span class="sentence">' + i + '</span>').join('')
            // var px = '';
            // for (var j = 0; j < ps.length; j++) {
            //     px += '<span class="sentence">' + ps[j] + '</span>';
            // }
            $p.html(px);
            console.log($p);
            return $p.children().first();
        }
    }

    function readBook($bookWrap , mute ) {
        var p = location.href.includes('#') ? location.href.replace(/.*#/,'') : location.pathname;
        if (ignoreList.includes(p) ) {
            console.log("该页忽略");
            return;
        }

        console.log("开始读取:", currentChapter);
        var $fp = $bookWrap.children().first();
        $p = formatParagraph($fp);
        text2Sound($fp , mute );
        if( $p.length )  pathname = p ; //有内容才算是切换成功，否则无法正常播放
    }

    function breakParagraph(txt, level) {
        if (level >= patterns.length) {
            level = patterns.length - 1;
        }
        var newsentences = [];
        var sentences = txt.split(patterns[level]);
        console.log(sentences);
        for (var i = 0; i < sentences.length; i++) {
            var tx = $.trim(sentences[i]);
            if (tx.lenth == 0) {
                continue;
            }

            if (i < sentences.length - 1) {
                sentences[i] += '。';
            }

            if (sentences[i].length > MAXLEN) {
                var s2 = breakParagraph(sentences[i], level + 1);
                var news2 = [];
                var lastLen = 0;
                for (var j = 0; j < s2.length; j++) {
                    if (news2.length == 0) {
                        news2.push(s2[j]);
                        lastLen += s2[j].length;
                    } else {
                        if (lastLen + s2[j].length < 300) {
                            var l = news2.length;
                            news2[l - 1] = news[l - 1] + s2[j];
                            lastLen += s2[j].length;
                        } else {
                            news2.push(s2[j]);
                            lastLen = s2[j].length;
                        }
                    }
                }

                newsentences = newsentences.concat(news2);
            } else {
                if (newsentences.length == 0) {
                    newsentences.push(sentences[i]);
                } else {
                    var lastI = newsentences.length - 1;
                    if (newsentences[lastI].length + sentences[i].length < MAXLEN) {
                        newsentences[lastI] += sentences[i];
                    } else {
                        newsentences.push(sentences[i]);
                    }
                }
            }
        }
        //console.log(newsentences);

        return newsentences;
    }
    function checkJump($ele){
        return $ele.hasClass('skip')  ||$ele.hasClass('countable')  ||  $ele.hasClass('docsify-pagination-container') || $ele.is('footer') || $ele.is('style') || $ele.is('pre')
    }
    async function text2Sound($ele , mute ) {
        if (isStop) {
            console.log("已停止");
            return;
        } else if (finished) {
            console.log(currentChapter, "本章已读完1");
            toNextChapter();
            return;
        } else if (null == $ele || $ele.length == 0) {
            console.log(currentChapter, "本章已读完2");
            toNextChapter();
            return;
        } else if ( checkJump($ele) ) {
            console.log("跳过: ", $ele.text());
            text2Sound($ele.next() , mute);
            return;
        }

        var $ele;
        var txt = $ele.text().trim();
        if (txt.length == 0) {
            console.log("skip empty");
            text2Sound($ele.next() , mute);
            return;
        }

        setCurrentActive($ele);
        console.log("文字转语音:", txt);
        let data = await $.post('https://7dtime.com/apix/z39sound/tts',{book_name: book_name,txt: txt}); //.catch(e=>alert("网络异常！"))
        if (typeof data == 'string') data = JSON.parse(data);
        if (data.errno ==100) return alert("发生错误："+ data.errmsg );
        currentMp3Path = data.data ;
        console.log("返回音频:" , txt.substr(0,10) , currentMp3Path);
        ready = true , inQuery = false;
        doPlay(currentMp3Path, mute);
        
    }

$(document).ready(function() {

    var sT = setInterval(function() {
        if (!player) return ;
        // if (!player ||  player.error != null || player.ended) return ;
        var du = player.audio.duration,
            cu = player.audio.currentTime;
        if (du && cu) {
            var r = parseInt(cu * 100 / du);
            //console.log("%" + r);
            var $curp = $(".pactive");
            var txt = $curp.text();
            var done = parseInt(r / 100 * txt.length);
            var ptxt = txt.substring(0, done);
            var ilen = parseInt(3 / du * txt.length);
            var itxt = txt.substring(done, done + ilen);

            $curp.html('<span class="pplayed">' + ptxt + '</span><span class="pplaying">' + itxt + '</span>' + txt.substring(done + ilen, txt.length));
        }
    }, 3000);


    setInterval(()=> {
        let temp = location.href.includes('#') ? location.href.replace(/.*#/,'') : location.pathname ;
        if (temp != pathname) {
            pathname = temp ;
            if ($(".chapter.active").find("a").attr('href') == './')  return console.log("跳过本章");

            $lastActiveEle = null;
            book_name = 'book_02';
            $bookWrap = $(".markdown-section");

            currentChapter = getCurrentChapter();
            insertAudio($(".content"));
            readBook($bookWrap , localStorage.autoPlayPause );
        }
    }, 3000);

    if ($(".chapter.active").find("a").attr('href') == './') {
        console.log("跳过本章");
        return;
    }

    currentChapter = getCurrentChapter();
    insertAudio($(".content"));
    initPlayerEvent()
    if( Mousetrap ){
        Mousetrap.bind('alt+c', function() { 
            autoScrollState = !autoScrollState , console.log('alt+c：自动滚动页面开关', autoScrollState) ;
            localStorage.autoScrollState = autoScrollState ;
        }) ;
    }
    readBook($bookWrap , localStorage.autoPlayPause );
});

function initPlayerEvent(){
        player.on('playing', playingListener);
        player.on('pause', pauseListener);
        player.on('ended', playEndListener);
}