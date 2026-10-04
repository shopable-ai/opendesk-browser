const gulp = require('gulp');
const concat = require('gulp-concat');

gulp.task('scripts', function() {
  return gulp.src(['src/**/*.js'], { allowEmpty: true }) // 源文件列表
    .pipe(concat('scrapyJsMerge.js')) // 合并后的文件名
    .pipe(gulp.dest('dist')); // 输出路径
});
