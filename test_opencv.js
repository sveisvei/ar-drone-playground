var cv = require('opencv');

cv.readImage("./test.jpg", function(err, im){
  im.convertGrayscale()
  im.canny(5, 500)
  im.dilate(5)
  var res = im.houghLinesP()
  console.log(res);
  var countours = im.findContours();

  
  console.log(countours.size(), countours);
  im.save('./out.jpg');
})