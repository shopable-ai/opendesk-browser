// This fixture proves resource records reach the existing Page main() contract.
export default async function main({assets}) {
  return {
    status:'ASSET_CONTRACT_BUILT',
    cssBytes:assets['assets/panel.css'].text.length,
    jsonName:JSON.parse(assets['assets/config.json'].text).name,
    imageUrlReady:assets['assets/mark.png'].url.startsWith('data:image/png;base64,')
  };
}
