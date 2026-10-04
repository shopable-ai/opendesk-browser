if (!globalThis.sleep)
  globalThis.sleep = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

initAppBase();

var isLookIp = 0;
function myPeriodicTask() {
  // 这里可以放你需要定时执行的代码

  // 检查当前页面URL是否包含特定地址
  var currentUrl = window.location.href;
  if (!currentUrl.includes("https://i.csdn.net/#/user-center")) {
    // 如果当前页面URL不包含特定地址，关闭定时器
    clearInterval(intervalId);
    isLookIp = 0;
  } else {
    initAppBase();
    if(currentUrl=="https://i.csdn.net/#/user-center/account"){
        isLookIp = 0;
    }
  }

  if (currentUrl.includes("https://i.csdn.net/#/user-center/account/log")) {
    if (isLookIp == 0) {
      isLookIp = 1;
      changeIp();
    }
  }
}

// 设置定时器，每隔5秒执行一次myPeriodicTask
var intervalId = setInterval(myPeriodicTask, 500);

async function initAppBase() {
  // console.log(11);
  // 如果域名中不是 csdn.net 则不执行。
  if (location.hostname.indexOf("csdn.net") < 0) return;

  await sleep(500);
  try {
    // await initData();
    await sleep(500);
    initViewBase();
    // initEvent();
    // initLogic();
  } catch (e) {
    console.log("initApp error:", e);
  }
}

async function initDataBase() {
  // console.log("localStorage.deviceCode:", localStorage.deviceCode)
}
async function initViewBase() {
  // let isLogin = isUserLoginByUI()
  // if (isLogin) {
  //  // let item = document.querySelector(".csdn-profile-nickName") ;
  //  document.querySelector("#csdn-toolbar-profile > div.csdn-profile-top > p").innerText = "2401_85191619" ;
  //  setTimeout(document.querySelector("#csdn-toolbar-profile > div.csdn-profile-top > p").innerText = "2401_85191619",2000)
  // }

  let isProfile = !!document.querySelector(    "#base-info > div.base-info-content"  );
  if (isProfile) {
    let username = document.querySelector(      "#base-info > div.base-info-content > div > form > ul > li:nth-child(1) > div.content-show-r"    );
    // username.innerText = "带毕设x各种会员";
    // username.innerText = "带毕设x各种会员";
    // document.querySelector("#user-center-container .profile-name-info .person-name").innerText = "带毕设x各种会员";
    // document.querySelector(
    //   "#base-info > div.base-info-content > div > form > ul > li:nth-child(2) > div.content-show-r"
    // ).innerText = "2401_85191619";
    // document.querySelector("div.general-info   div.profile-vip-info").innerHTML  = '<i data-v-df75d7f8="" class="vip-icon"></i> <div data-v-df75d7f8="" class="no-vip-info">开通会员全站VIP资源免费下，更有千元大奖等你拿</div> <a data-v-df75d7f8="" href="https://mall.csdn.net/vip" target="_blank" data-report-click="{&quot;spm&quot;:&quot;3001.5419&quot;}" data-report-query="spm=3001.5419" class="go-mall">开通会员</a>'
    // document.querySelector("div.general-info   div.profile-vip-info").style.display = "block";
  }

  // console.warn(    "username:",    { isProfile },    document.querySelector("#csdn-toolbar-profile > div.csdn-profile-top > p").innerText);
}

function isUserLoginByUI() {
  let hasLoginBtn = !!document.querySelector(".toolbar-btn-loginfun");
  return !hasLoginBtn;
}

async function changeIp() {
  // 获取ul元素
  var pager = document.querySelector(".el-pagination");
  if (pager) {
    // pager.style.display = "none";
  }
  // 获取ul容器
  var logList = document.querySelector(".log_list");
  return ;
  if (localStorage.isAdmin) {
    if (logList) logList.style.display = 'block'; 
    return console.log("admin jump") ;
  }

  // 获取所有class为'ip'和'place'的元素
  var ipElements = document.querySelectorAll(".ip");
  var placeElements = document.querySelectorAll(".place");

  // 如果元素不足20个，则填充
  var itemCount = logList?.children.length;

  for (var i = itemCount; i < 20; i++) {
    // 创建li元素
    var newItem = document.createElement("li");
    newItem.className = `item_cont ${i % 2 === 0 ? "white_bg" : "grey_bg"}`;
    newItem.setAttribute("data-v-27c99b48", "");
    // 创建时间span元素
    var timeSpan = document.createElement("span");
    timeSpan.className = "time";
    timeSpan.setAttribute("data-v-27c99b48", "");
    timeSpan.textContent = "2024-05-24 21:58";

    // 创建ip span元素
    var ipSpan = document.createElement("span");
    ipSpan.className = "ip";
    ipSpan.setAttribute("data-v-27c99b48", "");
    ipSpan.textContent = "(106.6.150.*)";

    // 创建place span元素
    var placeSpan = document.createElement("span");
    placeSpan.className = "place";
    placeSpan.setAttribute("data-v-27c99b48", "");
    placeSpan.textContent = "中国 江西 赣州";

    // 将所有span元素添加到li元素
    newItem.appendChild(timeSpan);
    newItem.appendChild(ipSpan);
    newItem.appendChild(placeSpan);

    // 将li元素添加到ul容器
    logList.appendChild(newItem);
  }

  // 修改所有class为'ip'和'place'的元素的文本内容
  ipElements = document.querySelectorAll(".ip");
  placeElements = document.querySelectorAll(".place");

  ipElements.forEach(function (ipElement) {
    // 修改IP地址
    ipElement.textContent = "(106.6.150.*)";
  });

  placeElements.forEach(function (placeElement) {
    // 修改地点信息
    placeElement.textContent = "中国 江西 赣州";
  });
  
  if (logList) {
    logList.style.display = 'block'; 
  }
}
