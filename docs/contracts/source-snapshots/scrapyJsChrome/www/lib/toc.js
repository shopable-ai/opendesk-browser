var defaultOptions = {
  headings: 'h1, h2',
  scope: '.markdown-section',

  // To make work
  title: 'Contents',
  listType: 'ul',
}

// Element builders
var tocHeading = function (Title) {
  return document.createElement('h2').appendChild(
    document.createTextNode(Title)
  )
}

var aTag = function (src) {
  var a = document.createElement('a');
  var content = src.firstChild.innerHTML;

  // Use this to clip text w/ HTML in it.
  // https://github.com/arendjr/text-clipper
  a.innerHTML = content;
  a.href = src.firstChild.href;
  a.onclick = tocClick

  // In order to remove this gotta fix the styles.
  a.setAttribute('class', 'anchor');

  return a
};

var tocClick = function (e) {
  var divs = document.querySelectorAll('.page_toc .active');

  // Remove the previous classes
  [].forEach.call(divs, function (div) {
    div.setAttribute('class', 'anchor')
  });

  // Make sure this is attached to the parent not itself
  e.target.parentNode.setAttribute('class', 'active')
};

var createList = function (wrapper, count) {
  try {
    while (count--) {
      wrapper = wrapper.appendChild(
        document.createElement('ul')
      );

      if (count) {
        wrapper = wrapper.appendChild(
          document.createElement('li')
        );
      }
    }
  } catch (e) {

  }

  return wrapper;
};

//------------------------------------------------------------------------

var getHeaders = function (selector) {
  var headings2 = document.querySelectorAll(selector);
  var ret = [];

  [].forEach.call(headings2, function (heading) {
    ret = ret.concat(heading);
  });

  return ret;
};

var getLevel = function (header) {
  var decs = header.match(/\d/g);

  return decs ? Math.min.apply(null, decs) : 1;
};

var jumpBack = function (currentWrapper, offset) {
  while (offset--) {
    if (currentWrapper) currentWrapper = currentWrapper.parentElement;
  }

  return currentWrapper;
};

var buildTOC = function (options) {
  var ret = document.createElement('ul');
  var wrapper = ret;
  var lastLi = null;
  var selector = options.scope + ' ' + options.headings
  var headers = getHeaders(selector)

  headers.reduce(function (prev, curr, index) {
    var currentLevel = getLevel(curr.tagName);
    var offset = currentLevel - prev;

    wrapper = (offset > 0)
      ? createList(lastLi, offset)
      : jumpBack(wrapper, -offset * 2)

    wrapper = wrapper || ret;

    var li = document.createElement('li');

    wrapper.appendChild(li).appendChild(aTag(curr));

    lastLi = li;

    return currentLevel;
  }, getLevel(options.headings));

  return ret;
};

// Docsify plugin functions
function plugin(hook, vm) {
  var userOptions = vm.config.toc;

  hook.mounted(function () {
    var content = window.Docsify.dom.find(".content");
    if (content) {
      var nav = window.Docsify.dom.create("aside", "");
      window.Docsify.dom.toggleClass(nav, "add", "nav");
      window.Docsify.dom.before(content, nav);
    }
  });

  hook.doneEach(function () {
    var nav = document.querySelectorAll('.nav')[0]
    var t = Array.from(document.querySelectorAll('.nav'))
    if (!nav) {
      return;
    }

    const toc = buildTOC(userOptions);

    // Just unset it for now.
    if (!toc.innerHTML) {
      nav.innerHTML = null
      return;
    }

    // Create title span
    var tabs = document.createElement('div');
    tabs.setAttribute('class', 'toc_tabs');

    var title = document.createElement('span');
    title.innerHTML = userOptions.title;
    title.setAttribute('class', 'title active');

    // Create commit span
    var commit = document.createElement('span');
    commit.innerHTML = userOptions.commit;
    commit.setAttribute('class', 'commit');

    var container = document.createElement('div');
    container.setAttribute('class', 'page_toc');

    var content = document.createElement('div');
    content.setAttribute('class', 'content_toc active');

    var contentCommit = document.createElement('div');
    contentCommit.setAttribute('class', 'content_commit');

    container.appendChild(tabs);
    tabs.appendChild(title);
    tabs.appendChild(commit);
    // container.appendChild(toc);
    container.appendChild(content);
    content.appendChild(toc);
    container.appendChild(contentCommit);

    // tabs 下的 span 点击事件，切换 toc 和 commit 的active 
    // Add event listener for the tabs div
    tabs.addEventListener('click', function (event) {
      // Check if the clicked element is a span
      if (event.target.tagName.toLowerCase() === 'span') {
        // Remove active class from all spans and contents
        title.classList.remove('active');
        commit.classList.remove('active');
        content.classList.remove('active');
        contentCommit.classList.remove('active');

        // Add active class to the clicked span
        event.target.classList.add('active');

        // Check which span was clicked and add active class to the relevant content
        if (event.target === title) {
          content.classList.add('active');
        } else if (event.target === commit) {
          contentCommit.classList.add('active');
        }
      }
    });

    // Existing TOC
    var tocChild = document.querySelectorAll('.nav .page_toc');

    if (tocChild.length > 0) {
      tocChild[0].parentNode.removeChild(tocChild[0]);
    }

    nav.appendChild(container);
  });
}

// Docsify plugin options
window.$docsify['toc'] = Object.assign(defaultOptions, window.$docsify['toc']);
window.$docsify.plugins = [].concat(plugin, window.$docsify.plugins);
