var arDrone = require('ar-drone')
  , http = require('http')
  , RGBAStream = require('./RGBAStream')
  , PaVEParser = require('./node_modules/ar-drone/lib/video/PaVEParser')
  , util = require('util')
  , net = require('net')
  , fs = require('fs')
  , Stream = require('stream').Stream
  , parser = new PaVEParser()
  , RGBA = new RGBAStream()
  , cv = require('opencv');

function FeatureParser() {
  Stream.call(this);
  this.writable = true;
  this.readable = true;
}

util.inherits(FeatureParser, Stream);

var firstImage = true;
FeatureParser.prototype.write = function(buf) {
  if (firstImage) {
    firstImage = false;
    // fs.writeFile('test.rgba', buf, function() {
    //   console.log('Wrote image');
    // });
    cv.readImage(buf, function(err, im){
      im.convertGrayscale();
      im.canny(5, 300);
      im.houghLinesP();
      im.save('./out.jpg');
      console.log('Wrote image');
    });
  }
};

var client = arDrone.createClient();
var fp = new FeatureParser();
client.config('video:video_channel', '1');
// var socket = net.connect({ host: '192.168.1.1', port: 5555}, function() {
//   console.log('Connected to drone');
//   socket.pipe(parser).pipe(RGBA).pipe(fp);
// });
var pngStream = arDrone.createPngStream();
pngStream.pipe(fp);

// var pngStream = arDrone.createPngStream();
// var lastPng;
// pngStream
//   .on('error', console.log)
//   .on('data', function(pngBuffer) {
//     lastPng = pngBuffer;
//   });
// var server = http.createServer(function(req, res) {
//   if (!lastPng) {
//     res.writeHead(503);
//     res.end('Did not receive any png data yet.');
//     return;
//   }
//   res.writeHead(200, {'Content-Type': 'image/png'});
//   res.end(lastPng);
// });
// server.listen(8080, function() {
//   console.log('Serving latest png on port 8080 ...');
// });

// client.takeoff();
// client.after(5000, function() {
//   this.land();
// });
