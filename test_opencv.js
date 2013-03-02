var cv = require('opencv');

cv.readImage("./test.jpg", function(err, im){
  im.convertGrayscale()
  im.canny(5, 300)
  im.houghLinesP()
  im.save('./out.jpg');
})