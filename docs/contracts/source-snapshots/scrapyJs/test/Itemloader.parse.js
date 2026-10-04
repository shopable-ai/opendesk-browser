
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

const htmlSample2 = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Product Listing</title>
</head>
<body>
    <div id="product-list">
        <div class="product">
            <h2 class="product-title"><a href="/product/1">Amazing Product</a></h2>
            <p class="product-description">This is an amazing product that you need!</p>
            <img class="product-image" src="/images/product1.jpg" alt="Amazing Product">
            <span class="product-price">$19.99</span>
        </div>
        <div class="product">
            <h2 class="product-title"><a href="/product/2">Fantastic Item</a></h2>
            <p class="product-description">You won't believe how fantastic this item is!</p>
            <img class="product-image" src="/images/product2.jpg" alt="Fantastic Item">
            <span class="product-price">$24.99</span>
        </div>
    </div>
</body>
</html>
`;

const htmlSample3 = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Blog Posts</title>
</head>
<body>
    <div id="blog-posts">
        <article class="post">
            <h1 class="post-title"><a href="/blog/1">First Blog Post</a></h1>
            <div class="post-content">
                <p>This is the content of the first blog post.</p>
            </div>
            <img class="post-image" src="/blog/image1.jpg" alt="First Blog Post Image">
            <div class="post-author">By <a href="/author/1">John Doe</a></div>
        </article>
        <article class="post">
            <h1 class="post-title"><a href="/blog/2">Second Blog Post</a></h1>
            <div class="post-content">
                <p>Here's what the second blog post is all about.</p>
            </div>
            <img class="post-image" src="/blog/image2.jpg" alt="Second Blog Post Image">
            <div class="post-author">By <a href="/author/2">Jane Smith</a></div>
        </article>
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

const config2 = {
    _listContainer: '#product-list',
    title: 'h2.product-title a',
    description: 'p.product-description',
    url: 'h2.product-title a::href',
    image: 'img.product-image::src',
    price: 'span.product-price'
};

const config3 = {
    _listContainer: '#blog-posts',
    title: 'h1.post-title a',
    content: 'div.post-content',
    url: 'h1.post-title a::href',
    image: 'img.post-image::src',
    author: 'div.post-author a'
};

console.log("Test 1: Search Results");
let result1 = await ItemLoader.parse(htmlSample1, config1, false, true);
console.log(JSON.stringify(result1, null, 2));

console.log("Test 1: Search Results");
let result1 = await ItemLoader.parse(htmlSample1, config1, false, true);
console.log(JSON.stringify(result1, null, 2));

// 测试函数
async function runTests() {
    console.log("Test 1: Search Results");
    let result1 = await ItemLoader.parse(htmlSample1, config1, false, true);
    console.log(JSON.stringify(result1, null, 2));

    console.log("\nTest 2: Product Listing");
    let result2 = await ItemLoader.parse(htmlSample2, config2, false, true);
    console.log(JSON.stringify(result2, null, 2));

    console.log("\nTest 3: Blog Posts");
    let result3 = await ItemLoader.parse(htmlSample3, config3, false, true);
    console.log(JSON.stringify(result3, null, 2));

    console.log("\nTest 4: Multiple parses on Search Results");
    let result4a = await ItemLoader.parse(htmlSample1, config1, false, true);
    let result4b = await ItemLoader.parse(htmlSample1, config1, false, true);
    console.log("First parse:", JSON.stringify(result4a, null, 2));
    console.log("Second parse:", JSON.stringify(result4b, null, 2));
}

// 运行测试
runTests().then(() => console.log("All tests completed"));