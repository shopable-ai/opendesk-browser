// ==OpenDeskParams==
// @version 1
// @param text keyword "关键词" required minLength=1
// @param number limit "数量" default=20 min=1 max=100
// ==/OpenDeskParams==

async function main() {
    const { keyword, limit } = params;

    return { keyword, limit };
}
