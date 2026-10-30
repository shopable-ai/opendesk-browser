package ai.opendesk.scrapyjs.node;

import android.app.Activity;
import android.os.Bundle;
import android.os.SystemClock;
import android.content.Context;
import android.net.*;
import android.text.InputType;
import android.util.Base64;
import android.view.ViewGroup;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.cert.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import javax.net.ssl.*;

/** Manual foreground-only private network test. No HTTP/SOCKS proxy, arbitrary scripts, or background work. */
public final class MainActivity extends Activity {
  private static final int PAGE_MAX=24*1024;
  private EditText macUrl,pin,token,paths;
  private CheckBox consent;
  private TextView log;
  private volatile Thread worker;
  private volatile HttpsURLConnection current;
  private volatile ConnectivityManager.NetworkCallback callback;
  private volatile boolean cancelled;
  private ConnectivityManager cm;

  private EditText field(LinearLayout column,String label,String hint,boolean secret,boolean multiline){
    TextView title=new TextView(this);title.setText(label);title.setPadding(0,12,0,0);column.addView(title);
    EditText e=new EditText(this);e.setHint(hint);
    e.setInputType(multiline?(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_FLAG_MULTI_LINE):
      secret?(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD):
      InputType.TYPE_CLASS_TEXT);
    e.setSingleLine(!multiline);if(multiline)e.setMinLines(3);
    column.addView(e,new LinearLayout.LayoutParams(-1,-2));return e;
  }
  @Override public void onCreate(Bundle state){
    super.onCreate(state);
    cm=(ConnectivityManager)getSystemService(Context.CONNECTIVITY_SERVICE);
    ScrollView scroll=new ScrollView(this);
    LinearLayout body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);
    int pad=(int)(16*getResources().getDisplayMetrics().density);body.setPadding(pad,pad,pad,pad);
    scroll.addView(body);
    TextView heading=new TextView(this);heading.setTextSize(16);
    heading.setText("ScrapyJS · 自有 Android 网络验证\n固定测试 Origin："+BuildConfig.TEST_ORIGIN+
      "\n仅前台 GET 1–3 页；Wi-Fi 交付，蜂窝出口。");
    body.addView(heading);
    macUrl=field(body,"Mac 局域网 HTTPS 地址","https://192.168.1.10:4443",false,false);
    pin=field(body,"Mac TLS 证书 DER SHA-256","64 位十六进制",false,false);
    token=field(body,"临时配对令牌","仅本次运行有效",true,false);
    paths=field(body,"授权测试路径（每行一条，1–3 条）","/fixture-1.html",false,true);
    paths.setText("/fixture-1.html");
    consent=new CheckBox(this);consent.setText("允许本次使用我的移动数据（默认关闭）");
    consent.setChecked(false);body.addView(consent);
    Button run=new Button(this);run.setText("运行真实双网络试采");body.addView(run);
    Button stop=new Button(this);stop.setText("停止");body.addView(stop);
    log=new TextView(this);log.setTextIsSelectable(true);log.setText("未连接 · NOT_TESTED");
    body.addView(log,new LinearLayout.LayoutParams(-1,ViewGroup.LayoutParams.WRAP_CONTENT));
    setContentView(scroll);
    run.setOnClickListener(v->start());
    stop.setOnClickListener(v->stop());
  }
  private void info(String msg){
    runOnUiThread(()->{
      String prior=log.getText().toString();
      if(prior.length()>3500)prior=prior.substring(prior.length()-2500);
      log.setText(prior+"\n"+msg);
    });
  }
  private void start(){
    if(worker!=null&&worker.isAlive()){info("E_RUNNING：不重复开始");return;}
    if(!consent.isChecked()){info("E_CONSENT：未授权移动数据，无法运行");return;}
    final String mac=macUrl.getText().toString().trim();
    final String certPin=pin.getText().toString().trim(),bearer=token.getText().toString().trim();
    final String targetPaths=paths.getText().toString();
    cancelled=false;log.setText("准备真实网络验证…");
    worker=new Thread(()->{
      try{run(mac,certPin,bearer,targetPaths);}
      catch(Exception e){info("FAILED / UNKNOWN："+e.getMessage());}
      finally{release();info("本机请求与 NetworkCallback 已释放");}
    },"scrapyjs-private-node");
    worker.start();
  }
  private void release(){
    cancelled=true;
    HttpsURLConnection c=current;if(c!=null)c.disconnect();
    ConnectivityManager.NetworkCallback cb=callback;callback=null;
    if(cb!=null)try{cm.unregisterNetworkCallback(cb);}catch(IllegalArgumentException ignored){}
  }
  private void stop(){
    release();Thread t=worker;if(t!=null)t.interrupt();
    info("已停止本地尝试；提交结果未知时不重试，按 runId 在 Mac 读回。");
  }
  @Override protected void onStop(){stop();super.onStop();}
  private void check() throws Exception{
    if(cancelled||Thread.currentThread().isInterrupted())throw new Exception("E_STOPPED");
  }
  private void transport(Network n,int kind) throws Exception {
    check();NetworkCapabilities c=cm.getNetworkCapabilities(n);
    if(c==null||!c.hasTransport(kind))throw new Exception("E_NETWORK_LOST：不会回退其他网络");
  }
  private Network wifi() throws Exception {
    for(Network n:cm.getAllNetworks()){
      NetworkCapabilities c=cm.getNetworkCapabilities(n);
      if(c!=null&&c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return n;
    }
    throw new Exception("E_WIFI_UNAVAILABLE");
  }
  private String wifiIpv4(Network n) throws Exception{
    LinkProperties p=cm.getLinkProperties(n);
    if(p!=null)for(LinkAddress a:p.getLinkAddresses()){
      InetAddress ip=a.getAddress();
      if(ip instanceof Inet4Address&&ip.isSiteLocalAddress())return ip.getHostAddress();
    }
    throw new Exception("E_WIFI_LAN_IPV4_REQUIRED");
  }
  private Network cellular() throws Exception{
    AtomicReference<Network> selected=new AtomicReference<>();
    CountDownLatch ready=new CountDownLatch(1);
    ConnectivityManager.NetworkCallback cb=new ConnectivityManager.NetworkCallback(){
      @Override public void onAvailable(Network n){selected.set(n);ready.countDown();}
      @Override public void onUnavailable(){ready.countDown();}
      @Override public void onLost(Network n){if(n.equals(selected.get())){selected.set(null);ready.countDown();}}
    };
    callback=cb;
    cm.requestNetwork(new NetworkRequest.Builder()
      .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
      .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),cb,12000);
    if(!ready.await(13,TimeUnit.SECONDS)||selected.get()==null)
      throw new Exception("E_CELLULAR_UNAVAILABLE");
    transport(selected.get(),NetworkCapabilities.TRANSPORT_CELLULAR);
    return selected.get();
  }
  private static boolean lan(String host){
    if(!host.matches("(?:[0-9]{1,3}\\.){3}[0-9]{1,3}"))return false;
    String[] p=host.split("\\.");int[] a=new int[4];
    for(int i=0;i<4;i++){a[i]=Integer.parseInt(p[i]);if(a[i]>255)return false;}
    return a[0]==10||(a[0]==192&&a[1]==168)||
      (a[0]==172&&a[1]>=16&&a[1]<=31);
  }
  private static String sha(byte[] bytes) throws Exception{
    byte[] hash=MessageDigest.getInstance("SHA-256").digest(bytes);
    StringBuilder s=new StringBuilder();for(byte b:hash)s.append(String.format(Locale.ROOT,"%02x",b&255));
    return s.toString();
  }
  private static SSLSocketFactory pinnedFactory(String fingerprint) throws Exception{
    if(!fingerprint.matches("[a-fA-F0-9]{64}"))throw new Exception("E_CERT_PIN_FORMAT");
    byte[] expected=new byte[32];
    for(int i=0;i<32;i++)expected[i]=(byte)Integer.parseInt(fingerprint.substring(i*2,i*2+2),16);
    X509TrustManager pinning=new X509TrustManager(){
      @Override public void checkClientTrusted(X509Certificate[] certificates,String auth) throws CertificateException{
        throw new CertificateException("No client certificates accepted");
      }
      @Override public void checkServerTrusted(X509Certificate[] chain,String auth) throws CertificateException{
        if(chain==null||chain.length==0)throw new CertificateException("No LAN TLS certificate");
        chain[0].checkValidity();
        try{
          byte[] got=MessageDigest.getInstance("SHA-256").digest(chain[0].getEncoded());
          if(!MessageDigest.isEqual(expected,got))throw new CertificateException("Mac certificate pin mismatch");
        }catch(CertificateException e){throw e;}
        catch(Exception e){throw new CertificateException("Pin check failed",e);}
      }
      @Override public X509Certificate[] getAcceptedIssuers(){return new X509Certificate[0];}
    };
    SSLContext ctx=SSLContext.getInstance("TLS");ctx.init(null,new TrustManager[]{pinning},new SecureRandom());
    return ctx.getSocketFactory();
  }
  private byte[] request(Network n,int kind,URL url,byte[] post,String bearer,
    SSLSocketFactory macTls,int maxBytes) throws Exception {
    transport(n,kind);
    if(!"https".equals(url.getProtocol()))throw new Exception("E_HTTPS");
    HttpsURLConnection c=(HttpsURLConnection)n.openConnection(url,Proxy.NO_PROXY);
    current=c;c.setInstanceFollowRedirects(false);c.setUseCaches(false);
    c.setConnectTimeout(8000);c.setReadTimeout(8000);
    if(macTls!=null)c.setSSLSocketFactory(macTls);
    if(bearer!=null)c.setRequestProperty("Authorization","Bearer "+bearer);
    try{
      if(post!=null){
        c.setRequestMethod("POST");c.setDoOutput(true);c.setFixedLengthStreamingMode(post.length);
        c.setRequestProperty("Content-Type","application/json");
        try(OutputStream stream=c.getOutputStream()){stream.write(post);}
      }
      int status=c.getResponseCode();
      if(status!=200&&!(post!=null&&status==201))
        throw new Exception("E_HTTP_"+status);
      ByteArrayOutputStream result=new ByteArrayOutputStream();
      try(InputStream in=c.getInputStream()){
        byte[] buf=new byte[4096];int nread;
        while((nread=in.read(buf))!=-1){check();
          if(result.size()+nread>maxBytes)throw new Exception("E_BODY_BUDGET");
          result.write(buf,0,nread);
        }
      }
      transport(n,kind);return result.toByteArray();
    }finally{c.disconnect();if(current==c)current=null;}
  }
  private void run(String receiver,String certPin,String bearer,String raw) throws Exception{
    long started=SystemClock.elapsedRealtime();String runId=UUID.randomUUID().toString();
    info("runId："+runId);
    String origin=BuildConfig.TEST_ORIGIN;
    if(origin.endsWith(".invalid")||!origin.matches("https://[A-Za-z0-9.-]+(?::[0-9]{2,5})?")||
       origin.contains("localhost"))throw new Exception("E_BUILD_TIME_ALLOWED_ORIGIN");
    URL site=new URL(origin);
    String[] input=Arrays.stream(raw.split("\\R")).map(String::trim).filter(p->!p.isEmpty())
      .toArray(String[]::new);
    if(input.length<1||input.length>3)throw new Exception("E_PAGE_COUNT");
    for(String p:input){
      if(!p.startsWith("/")||p.startsWith("//")||p.contains("#")||
         p.contains("\\")||p.length()>400)throw new Exception("E_PAGE_PATH");
    }
    URL m=new URL(receiver);
    if(!m.getProtocol().equals("https")||!lan(m.getHost())||
      !(m.getPath().isEmpty()||m.getPath().equals("/"))||
      m.getUserInfo()!=null||m.getQuery()!=null||m.getRef()!=null||
      !bearer.matches("[a-fA-F0-9]{64}"))throw new Exception("E_MAC_PAIRING");
    String mac="https://"+m.getHost()+":"+(m.getPort()==-1?443:m.getPort());
    SSLSocketFactory pinned=pinnedFactory(certPin);
    Network local=wifi();transport(local,NetworkCapabilities.TRANSPORT_WIFI);
    String wifiLanIp=wifiIpv4(local);
    info("Wi-Fi 局域网控制链路连接中…");
    byte[] ping=request(local,NetworkCapabilities.TRANSPORT_WIFI,new URL(mac+"/v1/ping"),
      null,bearer,pinned,4096);
    if(!"scrapyjs.poc.ping.v1".equals(new JSONObject(new String(ping,StandardCharsets.UTF_8))
      .getString("schema")))throw new Exception("E_WIFI_PAIR_FAILED");
    Network cell=cellular();
    info("Cellular 网络已获得，读取公网出口…");
    byte[] echo=request(cell,NetworkCapabilities.TRANSPORT_CELLULAR,
      new URL("https://api.ipify.org?format=json"),null,null,null,1024);
    String egress=new JSONObject(new String(echo,StandardCharsets.UTF_8)).getString("ip");
    if(egress.length()>64||!egress.matches("[0-9a-fA-F:.]+"))
      throw new Exception("E_EGRESS_ECHO");
    JSONArray pages=new JSONArray();
    for(String path:input){
      check();
      if(SystemClock.elapsedRealtime()-started>45000)throw new Exception("E_DEADLINE");
      URL target=new URL(origin+path);
      int targetPort=target.getPort()==-1?target.getDefaultPort():target.getPort();
      int sitePort=site.getPort()==-1?site.getDefaultPort():site.getPort();
      if(!target.getProtocol().equals(site.getProtocol())||!target.getHost().equals(site.getHost())||
         targetPort!=sitePort||target.getUserInfo()!=null)throw new Exception("E_ORIGIN");
      info("CELLULAR GET："+target.getPath());
      byte[] body=request(cell,NetworkCapabilities.TRANSPORT_CELLULAR,target,null,null,null,PAGE_MAX);
      if(body.length==0)throw new Exception("E_EMPTY_RESPONSE");
      JSONObject page=new JSONObject();page.put("url",target.toExternalForm());
      page.put("status",200);page.put("bytes",body.length);page.put("sha256",sha(body));
      page.put("bodyBase64",Base64.encodeToString(body,Base64.NO_WRAP));
      pages.put(page);
    }
    transport(cell,NetworkCapabilities.TRANSPORT_CELLULAR);
    transport(local,NetworkCapabilities.TRANSPORT_WIFI);
    long duration=SystemClock.elapsedRealtime()-started;
    if(duration>60000)throw new Exception("E_DEADLINE");
    JSONObject report=new JSONObject();
    report.put("schema","scrapyjs.private-cellular-poc.v1");
    report.put("runId",runId);report.put("mode","private");report.put("shared",false);
    report.put("origin",origin);report.put("wifiLanIp",wifiLanIp);
    report.put("cellularEgressIp",egress);
    report.put("wifiNetworkHandle",Long.toUnsignedString(local.getNetworkHandle()));
    report.put("cellularNetworkHandle",Long.toUnsignedString(cell.getNetworkHandle()));
    report.put("durationMs",duration);report.put("pages",pages);
    info("通过 Wi-Fi 提交真实页面回执，未知结果不重复执行。");
    byte[] receipt=request(local,NetworkCapabilities.TRANSPORT_WIFI,
      new URL(mac+"/v1/evidence"),report.toString().getBytes(StandardCharsets.UTF_8),
      bearer,pinned,4096);
    JSONObject ack=new JSONObject(new String(receipt,StandardCharsets.UTF_8));
    if(!ack.optBoolean("saved",false)||!runId.equals(ack.optString("runId")))
      throw new Exception("E_OUTCOME_UNKNOWN");
    info("Mac 接收器确认保存 runId："+runId+"；仍需 Mac 独立读回确认。");
  }
}
