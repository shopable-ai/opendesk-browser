import unittest
from scrapyjs_runner.dsl import compile_config, extract
from scrapyjs_runner.errors import Fault

HTML = '''<section data-list="a::b"><article><h1>甲 &amp; 乙</h1><a href="/一?x=2&amp;y=3">链接</a><i>A</i><i>B</i><img src="/图.png"></article><article><h1>第二行</h1><a href="/二"></a></article><div><article><h1>干扰</h1></article></div></section>'''
CONFIG = {'url':'https://example.org/list','itemConfig':{'_listContainer':'[data-list="a::b"]','_listItem':'article','title':'h1::text','href':'a::href','tags':{'selector':'i','read':'text','cardinality':'many'},'optional':'.missing::title','nested':{'name':{'selector':'a','read':'text','cardinality':'one'}},'image':'img','default':'a'}}

class DslTests(unittest.TestCase):
    def test_real_scrapling_preserves_original_itemloader_values_and_direct_children(self):
        self.assertEqual(extract(HTML, compile_config(CONFIG)), [
            {'title':'甲 & 乙','href':'/一?x=2&y=3','tags':['A','B'],'optional':'','nested':{'name':'链接'},'image':'/图.png','default':'链接'},
            {'title':'第二行','href':'/二','tags':[],'optional':'','nested':{'name':''},'image':'','default':'/二'}])
    def test_one_rejects_duplicates(self):
        cfg={'url':'https://example.org','itemConfig':{'v':{'selector':'i','cardinality':'one'}}}
        with self.assertRaises(Fault) as e: extract(HTML,compile_config(cfg))
        self.assertEqual(e.exception.code,'CARDINALITY')
    def test_unsupported_is_explicit_not_silently_discarded(self):
        for cfg in [dict(CONFIG, detail={}),dict(CONFIG,processing={}),dict(CONFIG,itemConfig={'x':'.//a'}),dict(CONFIG,itemConfig={'x':{'selector':'a','read':'innerHTML'}})]:
            with self.subTest(cfg=cfg), self.assertRaises(Fault) as e: compile_config(cfg)
            self.assertEqual(e.exception.code,'NOT_SUPPORTED')
    def test_missing_auto_many_and_empty_list(self):
        cfg={'url':'https://example.org','itemConfig':{'v':'i','empty':'.missing','many':{'selector':'.missing','cardinality':'many'}}}
        self.assertEqual(extract(HTML,compile_config(cfg)),[{'v':['A','B'],'empty':'','many':[]}])
        self.assertEqual(extract('<div></div>',compile_config(CONFIG)),[])

if __name__=='__main__': unittest.main()

class CurrentItemTests(unittest.TestCase):
    def test_dot_reads_current_item_without_losing_nested_or_suffix_rules(self):
        cfg={'url':'https://example.org','itemConfig':{'_listContainer':'ul','_listItem':'li','text':'.::text','attr':'.::data-id','descriptor':{'selector':'.','read':'text','cardinality':'one'},'reservedText':{'selector':'.','read':'attr','attr':'text'},'quoted':'a[data-x="x::y"]::href'}}
        self.assertEqual(extract('<ul><li data-id="a" text="attribute"><span>A</span><b>B</b><a data-x="x::y" href="/q"></a></li></ul>',compile_config(cfg)),[{'text':'AB','attr':'a','descriptor':'AB','reservedText':'AB','quoted':'/q'}])

class ReviewScopeTests(unittest.TestCase):
    def parse(self, html, fields):
        return extract(html,compile_config({'url':'https://example.org/list','itemConfig':fields}))

    def test_review_sibling_combinators_never_read_another_row(self):
        self.assertEqual(self.parse('<ul><li id="a">A</li><li id="b">B</li></ul>',{'_listContainer':'ul','_listItem':'li','id':'.::id','next':'li + li::text','following':'li ~ li::text'}),[
            {'id':'a','next':'','following':''},{'id':'b','next':'','following':''}])

    def test_review_ancestor_qualified_css_keeps_only_current_row_descendants(self):
        self.assertEqual(self.parse('<html><body><ul><li><b>A</b></li><li><b>B</b></li></ul><b>OUTSIDE</b></body></html>',{'_listContainer':'ul','_listItem':'li','v':'ul li b::text','self':'li::text'}),[
            {'v':'A','self':''},{'v':'B','self':''}])

    def test_review_document_html_root_is_selectable(self):
        self.assertEqual(self.parse('<html lang="en"><body><p>P</p></body></html>',{'html':'html::lang','body':'body::text'}),[{'html':'en','body':'P'}])

    def test_review_scope_pseudo_is_bound_to_each_row_and_cannot_escape(self):
        self.assertEqual(self.parse('<ul><li id="a"><b>A</b><section><b>NESTED</b></section></li><li id="b"><b>B</b></li></ul>',{'_listContainer':'ul','_listItem':'li','id':'.::id','direct':':scope > b::text','leak':':scope + li b::text','self':':scope::text'}),[
            {'id':'a','direct':'A','leak':'','self':''},{'id':'b','direct':'B','leak':'','self':''}])

    def test_review_nested_field_named_selector_remains_nested(self):
        self.assertEqual(self.parse('<html><body><b>A</b><b>B</b><p>P</p></body></html>',{'meta':{'selector':{'selector':'b','read':'text'},'value':'p'}}),[
            {'meta':{'selector':['A','B'],'value':'P'}}])

class ListContainerScopeTests(unittest.TestCase):
    def test_scope_item_filter_binds_each_container_and_keeps_direct_children_only(self):
        config={'url':'https://example.org/list','itemConfig':{
            '_listContainer':'ul','_listItem':':scope > li.book','id':'.::data-id',
            'title':'h2::text','missing':'.price::text'}}
        html='<ul><li class="book" data-id="A"><h2>甲</h2></li><li data-id="skip"><h2>跳过</h2></li><section><li class="book" data-id="nested"><h2>嵌套</h2></li></section></ul><ul><li class="book" data-id="B"><h2>乙</h2></li></ul>'
        self.assertEqual(extract(html,compile_config(config)),[
            {'id':'A','title':'甲','missing':''},{'id':'B','title':'乙','missing':''}])
