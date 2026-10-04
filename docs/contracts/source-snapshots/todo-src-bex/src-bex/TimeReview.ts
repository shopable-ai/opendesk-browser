// @ts-nocheck
import axios from 'axios';
import _ from 'lodash';
import moment from 'moment';
import queryString from 'query-string';
// import fetch from 'node-fetch';

class TimeReview {
    private currActionKey: string;
    private lastActionKey: string;
    private lastActionTime: number;
    private waitSendItem: ActionItem | null;
    private delayData: { [key: string]: ActionItem };
    // @ts-ignore
    private lastSendTime: number;
	private timestamp: number;
    private lastSendKey: string;
	private indexTimestamp: number;
	private DB_PRECISION =  6 ; // 当前是mysql，默认是6，postgresql是3。时序数据库精度，毫秒级别。 6位数
	private hasInit = false ;
	private isActive = false ;

    // 添加属性来存储构造函数的参数
    private token: string | null = null;
    private apikey: string | null = null;
    private type: string | undefined;
    private baseURL: string = 'https://api.todo6.com' ;

	private throttledCheckSend ;
    private validateRes:any ;

    private static searchArr = [
        { key: 'google.com/search', value: 'q' },
        { key: 'baidu.com/s', value: 'wd' },
        { key: 'sogou.com/web', value: 'query' },
        { key: 'so.com/s', value: 'q' },
        { key: 'github.com/search', value: 'q' }
    ];

	/**
	 * token 和 apikey 二选一，token优先。
	 * 如果type为空，则使用浏览器的类型+版本号。
	 * @param params
	 */
    constructor(params: {type?: string,  baseURL: string, token?: string, apikey?: string}) {
        this.currActionKey = '';
        this.lastActionKey = '';
        this.lastActionTime = 0;
        this.waitSendItem = null;
        this.delayData = {};
        this.lastSendTime = 0;
        this.lastSendKey = '';

        // 设置属性的值
        this.type = params.type || this.getType();
        this.baseURL = params.baseURL;
        this.token = params.token || null;
        this.apikey = params.apikey || null;
		this.throttledCheckSend = _.throttle(this.doCheckSend, 2000 );

		axios.defaults.baseURL = this.baseURL ;
		this.initData();
		this.sendLostCacheAction();
        this.startInterval();
    }

	// 后期：还需要考虑切换账号或apikey的情况。
	public async initData() {

		if( !this.token && !this.apikey) { // 如果token和apkkey为空，则跳出。
			this.isActive = false ;
			this.hasInit = false ;
			return ;
		}
		if( this.hasInit ) return ; // 已经初始化过了，不需要再初始化了。
		this.isActive = true ;

        if(this.token)  axios.defaults.headers['Authorization'] = this.token;
		if(this.apikey) axios.defaults.headers['X-API-Key'] = this.apikey;

        let res ;
        if (typeof window !== 'undefined') res = await axios.get('/app/todo/action/config', { params: { type:this.type } }).then(r => r.data).catch(e => ({ error: true, ...e.response?.data }));
        else {
            let headers:any = { Authorization: this.token, 'X-API-Key': this.apikey  };
            let response = await fetch( this.baseURL + `/app/todo/action/config?type=${encodeURIComponent(this.type as string)}`, { headers });
            res = await response.json();
            if ( !response.ok )  res = { error: true, ...res };
        }

        if(res?.error) return  res ;
        let {  index, precision, token: tokenNew } = res.data;
        this.indexTimestamp = index,
		this.DB_PRECISION = precision || this.DB_PRECISION;
		this.hasInit = true ;
        console.log('initData:', res , tokenNew);
    }

	public setToken(token: string | null): void {
		this.token = token ;
		this.initData();
	}
	public setApikey(apikey: string | null): void {
		this.apikey = apikey ;
		this.initData();
	}

    private startInterval(): void {
        setInterval(() => {
			if( !this.isActive ) return ;
            this.dowichSend();
        }, 60000);
    }

	// 发送上次缓存数据；
	// 是否可以优化，在浏览器关闭之前的回调中，发送数据。
	private async  sendLostCacheAction(){
		let actionData ;
        if (typeof window !== 'undefined') actionData = localStorage.action ;
		if(!actionData) return ;
		let action = JSON.parse(actionData) as ActionItem ;
        let data:any = await this.httpSend(action);
		console.log('发送缓存中未发送的数据 res:' , data ); // , actions , senddata
		if( data && data.code == 1000) {
            if (typeof window !== 'undefined') delete localStorage.action  ;
        }
	}

	// 添加待发送的数据，如果是同一个页面，更新持续时间duration。
    public async addAction(action: ActionItem): Promise<void> {
        // @ts-ignore
        let { path, title } = action;
        this.currActionKey = path;

        let lastItem = this.delayData[this.currActionKey];
        if (this.currActionKey == this.lastActionKey && lastItem) {
            action.duration = lastItem.duration + (new Date().getTime() - lastItem.timestamp);
        }
        this.delayData[this.currActionKey] = action;
        this.lastActionKey = this.currActionKey;
        this.lastActionTime = action.timestamp;  // timestamp: new Date().getTime()
    }

	// 1分钟内访问量很多页面，从里面提取出时间最长的页面，发送。
	// 延迟发送，如果还在继续访问，则添加duration，否则发送。
    private async dowichSend(): Promise<void> {
        if (!this.delayData || _.isEmpty(this.delayData)) {
			this.doCheckSend(null,null)
			return;
		}

        let actions = _.sortBy(_.values(this.delayData), 'duration');
        let senddata = actions.pop();
        // delete senddata.active;

        let item: ActionItem = senddata as ActionItem;
        // let userId = localStorage.userId || localStorage.id || localStorage._id;
        // item.userId = userId;
        item.path = this.filterQueryURL(item.path);
        let isNew = !this.lastSendKey || this.lastSendKey != item.path;

		// 只有访问新页面，重新计时。或者长时间没有访问时，发送上次数据。
		if(isNew) this.timestamp = new Date().getTime() - 60*1000 ;
		// 这里的duration是发送的，和上面的duration排序用，作用不同。数据不同。
		item.duration = Math.round( ( new Date().getTime() - this.timestamp)/1000/60 );
		// moment(timestamp).format('YYYY-MM-DD HH:mm:ss.SSS') ;
		let timeTemp = moment(this.timestamp).format('YYYY-MM-DD HH:mm:00')
		// indexTimestamp 是为了时序数据库设计的，保证时间唯一。每个用户登录后获取一个index，用于时间唯一。
		// 可以结合 DB_PRECISION 一起使用，增加用户使用数量。
		item.createTime = moment(timeTemp).add( this.indexTimestamp , 'ms').format('YYYY-MM-DD HH:mm:ss.SSS') ;

        await this.doCheckSend(item, { actions, senddata });
        this.delayData = {};
        this.lastSendTime = this.lastActionTime;
        this.lastSendKey = item.path;
    }

	// 发送数据，夸日发送。如果是新的一天，拆分成两条数据。
    private async doCheckSend(item: ActionItem | null, justShow: any): Promise<void> {
		if( !item && !this.waitSendItem ) return ; // 无数据可发送；
        if ( typeof window !== 'undefined') {
			if(item) window.localStorage.action = JSON.stringify(item);
			else delete window.localStorage.action
		}
		// if(!item ) console.info('doCheckSend' ,  moment().format('YYYY-MM-DD HH:mm:ss.SSS') , this.waitSendItem );

        if (!this.waitSendItem) {  //缓存还未发送数据，
            this.waitSendItem = item;
            return;
        }
        if ( item && this.waitSendItem.createTime == item?.createTime) { // 还在持续访问页面，等下再发送。
            this.waitSendItem = item;
            return;
        }

        let today = moment().format('YYYY-MM-DD');
        if (!this.waitSendItem.createTime?.includes(today)) {  // 跨日发送，拆分成两条数据。
            let createTime = this.waitSendItem.createTime;
            let endOfDay = moment(this.waitSendItem.createTime).endOf('day');
            let durationToEndOfDay = moment.duration(endOfDay.diff(moment(this.waitSendItem.createTime))).asMinutes();
            let durationFromStartOfDay = this.waitSendItem.duration - durationToEndOfDay;

            this.waitSendItem.duration = durationToEndOfDay;

            await this.httpSend(this.waitSendItem);
            this.waitSendItem.createTime = today + ' 00:00:00' + this.waitSendItem.createTime?.substr(19);
            this.waitSendItem.duration = moment(createTime).hours() * 60 + moment(createTime).minute();
			// 如果durationFromStartOfDay 和 durationToEndOfDay + this.waitSendItem.duration 相减，绝对值大于2，则打印错误信息；
			if( Math.abs( durationFromStartOfDay - (durationToEndOfDay + this.waitSendItem.duration) ) > 2 ) {
				console.error('跨日数据异常' , durationFromStartOfDay , durationToEndOfDay , this.waitSendItem.duration ) ;
			}

            await this.httpSend(this.waitSendItem);
        } else {
            await this.httpSend(this.waitSendItem);
        }
        console.log('send res:', { sending: this.waitSendItem, waiting: item, ...justShow });

		if( !item ) {
			this.lastActionKey = '';
			this.lastSendKey = '';
			this.delayData = {};
			this.timestamp = 0 ;
		}
        this.waitSendItem = null;
    }

	/**
	 * 关闭前发送最后一条数据。
	 * @returns
	 */
	public async doSendBeforeClose(): Promise<void> {
		if( !this.isActive ) return ;
		this.throttledCheckSend(null, null); //节流函数，避免重复调用多次this.doCheckSend
	}

    // 可以增加缓存时间。一天或1个小时。每次获取就太频繁
    public async validate(): Promise<{ error?: boolean, status?: number, [key: string]: any }> {
        if( this.validateRes && !this.validateRes.error ) return this.validateRes ;  // 缓存验证数据;
        let res;
        let headers: any = { Authorization: this.token, 'X-API-Key': this.apikey , 'Content-Type': 'application/json' };

        if ( typeof window !== 'undefined' ) { //
            res = await axios.get('/app/common/apikey/validate').then(r => ({ ...r.data, status: 200 }))
                .catch(e => ({ error: true, status: e.response?.status, ...e.response?.data }));
        } else {
            let response =  await fetch( this.baseURL + '/app/common/apikey/validate', { method: 'GET', headers })
            res = await response.json();
            if (!response.ok) res.error = true ;
        }
        console.log('validate res:', res);
        this.validateRes = res ;
        return res;
    }

    private async httpSend(item: ActionItem): Promise<any> {
        let res;
        if (typeof window !== 'undefined') {
            res = await axios.post('/app/todo/action/add', item).then(r => r.data).catch(e => ({ error: true, ...e.response?.data }));
        } else {
            let headers: any = { Authorization: this.token, 'X-API-Key': this.apikey , 'Content-Type': 'application/json' };
            let response = await fetch(this.baseURL + '/app/todo/action/add', { method: 'POST', headers, body: JSON.stringify(item)})
            res = await response.json();
            if (!response.ok) res = { error: true, ...res };
        }
        console.log('send res:', res);
        this.validateRes = res ; // 如果服务器有返回，也可以作为验证的数据使用。如果数据出错，也可以更早发现问题。
        return res;
    }


	// 过滤网页中多余的参数，保证url唯一。
    private filterQueryURL(url: string): string {
		// 如果不是http开头，则直接返回
		if (!url.startsWith('http')) return url;
        url = this.getSearchUrl(url);
        if (url.includes('bilibili.com/video/') || url.includes('blog.csdn.net')) url = url.replace(/\?.*/, '');
        if (url.includes('token=')) url = url.replace(/token=.*/, '');
        url = url.substr(0, 200);
        if (url.includes('?')) url = decodeURIComponent(url);
        return url;
    }

	// 获取搜索引擎的关键字，保留关键字，过滤其他参数。
    private getSearchUrl(url: string): string {
        //@ts-ignore
        let item = TimeReview.searchArr.find(({ key, value }) => url.includes(key));
        if (item) url = item.key + `?${item.value}=${this.getSearchKey(url, item.value)}`;
        return url;
    }

    private getSearchKey(url: string, wd: string): string {
        let query = queryString.parse(url.replace(/.*\?/, ''));
        let value = query[wd];

        // 如果 value 是一个字符串数组，返回数组的第一个元素
        if (Array.isArray(value)) {
            return decodeURIComponent(value[0] || '');
        }

        // 否则，假设它是一个字符串并返回
        return decodeURIComponent(value || '');
    }


	private getBrowserInfo() {
		const ua = navigator.userAgent;
		let tem,
			M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];

		if (/trident/i.test(M[1])) {
			tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
			return {name:'IE', version:(tem[1] || '')};
		}
		if (M[1] === 'Chrome') {
			tem = ua.match(/\b(OPR|Edge)\/(\d+)/);
			if (tem != null) return {name:tem[1].replace('OPR', 'Opera'), version:tem[2]};
		}
		M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
		if ((tem = ua.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1]);
		return {
			name: M[0],
			version: M[1]
		};
	}
	private getType() {
		let browser = this.getBrowserInfo();
		let type = browser.name + browser.version ;
		return type ;
	}
}

interface ActionItem {
    createTime?: string;
    duration: number;
    timestamp: number;
    path: string;
    title: string;
    action: string;
    app: number;
    userId?: string;
    ext?:any;  // 扩展json字段，存储各种自定义字段。
}

export default TimeReview;
