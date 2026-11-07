// Cookie expiration is a user-entered wall clock in the device's local time zone.
// The Chrome Cookie API boundary, however, accepts an absolute Unix-second value.
// Keep this conversion pure and shared by the installed React editor and Preview.
const pad=value=>String(value).padStart(2,'0');

export function localExpirationText(seconds){
  if(!Number.isFinite(seconds))return '';
  const date=new Date(seconds*1000);
  if(!Number.isFinite(date.getTime()))return '';
  return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate())+
    'T'+pad(date.getHours())+':'+pad(date.getMinutes())+':'+pad(date.getSeconds());
}

// "datetime-local" omits the UTC offset. During a fall-back transition the
// same text can identify two instants; choosing one silently changes expiry.
// A spring-forward gap identifies no instant. Reject both without inventing
// a default date or extending the lifetime of a session Cookie.
export function parseLocalExpiration(input){
  if(typeof input!=='string')return {status:'invalid'};
  const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(input);
  if(!match)return {status:'invalid'};
  const [,yearText,monthText,dayText,hourText,minuteText,secondText='00']=match;
  const year=Number(yearText),month=Number(monthText),day=Number(dayText);
  const hour=Number(hourText),minute=Number(minuteText),second=Number(secondText);
  if(year<1970||year>9999||month<1||month>12||day<1||day>31||
    hour>23||minute>59||second>59)return {status:'invalid'};
  const wallUtc=Date.UTC(year,month-1,day,hour,minute,second);
  const wall=new Date(wallUtc);
  if(!Number.isFinite(wallUtc)||wall.getUTCFullYear()!==year||
    wall.getUTCMonth()+1!==month||wall.getUTCDate()!==day||
    wall.getUTCHours()!==hour||wall.getUTCMinutes()!==minute||
    wall.getUTCSeconds()!==second)return {status:'invalid'};
  const canonical=yearText+'-'+monthText+'-'+dayText+'T'+hourText+':'+
    minuteText+':'+secondText;
  // Probe both sides of the transition, including half-hour DST regions.
  // Compute candidates from UTC-offset arithmetic instead of Date's
  // implicit "earlier occurrence" fall-back policy.
  const offsets=new Set([-86400000,-43200000,0,43200000,86400000]
    .map(delta=>new Date(wallUtc+delta).getTimezoneOffset()));
  const candidates=[...offsets]
    .map(offset=>wallUtc+offset*60000)
    .filter(ms=>localExpirationText(ms/1000)===canonical);
  if(candidates.length===0)return {status:'nonexistent'};
  if(candidates.length>1)return {status:'ambiguous'};
  return {status:'valid',seconds:candidates[0]/1000};
}

export function compareCookieExpiration(a,b){
  // A session Cookie has no expiration timestamp, not epoch zero.
  // Put sessions last, with stable name ordering between equal timestamps.
  const expiry=row=>row.session||!Number.isFinite(row.expirationDate)
    ?Number.POSITIVE_INFINITY:row.expirationDate;
  const left=expiry(a),right=expiry(b);
  return left===right?a.name.localeCompare(b.name):left-right;
}
