
// HTML Samples
const htmlSample1 = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Search Results</title>
</head>
<body>
    <div id="content_left">
        <div class="result-item">
            <h3 class="c-title"><a href="https://example.com/1">First Result</a></h3>
            <span class="content-right_2s-H4">Description of the first result</span>
            <div class="image-wrapper_39wYE"><img src="https://example.com/image1.jpg" alt="First Image"></div>
            <div class="source_1Vdff"><a href="https://author.com/1">Author One</a></div>
        </div>
        <div class="result-item">
            <h3 class="c-title"><a href="https://example.com/2">Second Result</a></h3>
            <span class="content-right_2s-H4">Description of the second result</span>
            <div class="image-wrapper_39wYE"><img src="https://example.com/image2.jpg" alt="Second Image"></div>
            <div class="source_1Vdff"><a href="https://author.com/2">Author Two</a></div>
        </div>
    </div>
</body>
</html>
`;

// Configs
const config1 = {
    _listContainer: '#content_left',
    title: 'h3.c-title a',
    description: 'span.content-right_2s-H4',
    url: 'h3.c-title a::href',
    image: 'div.image-wrapper_39wYE img::src',
    author: 'div.source_1Vdff a'
};


// await ItemLoader.parse(`<html lang="en"> random </html>`, config1, false, true);

console.log("Test 1: Search Results");
let result1 = await ItemLoader.parse(htmlSample1, config1, false, true);
console.log(JSON.stringify(result1, null, 2));


console.log("Test 1: Search Results");
result1 = await ItemLoader.parse(htmlSample1, config1, false, true);
console.log(JSON.stringify(result1, null, 2));
