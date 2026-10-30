plugins { id("com.android.application") }
val testOrigin = providers.gradleProperty("scrapyJsTestOrigin").orElse("https://not-configured.invalid").get()
require(testOrigin.matches(Regex("https://[A-Za-z0-9.-]+(?::[0-9]{2,5})?"))) {
  "scrapyJsTestOrigin must be a single public HTTPS origin"
}
android {
  namespace = "ai.opendesk.scrapyjs.node"
  compileSdk = 35
  defaultConfig {
    applicationId = "ai.opendesk.scrapyjs.node.poc"
    minSdk = 26
    targetSdk = 35
    versionCode = 1
    versionName = "0.1.0-poc"
    buildConfigField("String", "TEST_ORIGIN", "\"" + testOrigin + "\"")
  }
  buildFeatures { buildConfig = true }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}
