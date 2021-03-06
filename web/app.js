var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , arDrone = require('ar-drone')

process.on('uncaughtException', function(err) {
  console.error(err);
});

// ensures heading angle between 0 and 360
function normalizeHeading(heading) {
  heading = heading % 360;
  if (heading < 0) heading = 360 + heading;
  return heading;
}

// updates heading to be between -180 and 180
function clampHeading(heading) {
  heading = heading % 360;
  return heading > 180 ? -(360 - heading) : heading;
}

// interpolates direction
function ease(oldValue, newValue) {
  return oldValue * 0.5 + newValue * 0.5;
}

function roundTwo(val) {
  return Math.round(val * 100) / 100;
}

var app = express();
app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  // app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});
app.configure('development', function(){
  app.use(express.errorHandler());
});
app.get('/', routes.index);

var server = http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});

var WebSocketServer = require('ws').Server
  , wss = new WebSocketServer({server: server});
wss.on('connection', function(ws) {
  console.log('Client connected');

  function logToClient(data) {
    try {
      ws.send(JSON.stringify({type: 'log', data: data}));
    }
    catch(e) {}
  }

  // constants
  var maxTurnSpeed = 0.8;
  var minTurnSpeed = 0.1;
  var maxTurnSpeedThreshold = 45; // any difference above this threshold will result in max turning speed
  var turnIntervalFrequency = 100;
  // state
  var syncedOnce = false;
  var lastDroneHeading = 0;
  var lastControllerHeading = 0;
  var headingDifference = 0;
  var clientLoggingData = {};

  var udpControl = arDrone.createUdpControl();
  var client = arDrone.createClient({udpControl: udpControl});
  client.config('general:navdata_demo', 'FALSE');
  client.on('navdata', function(navdata) {
    if (!navdata) return;
    if (navdata.magneto) {
      lastDroneHeading = ease(lastDroneHeading, normalizeHeading(roundTwo(navdata.magneto.heading.unwrapped)));
    }
    if (navdata.demo && navdata.demo.batteryPercentage) {
      clientLoggingData.batteryPercentage = navdata.demo.batteryPercentage;
    }
  });

  ws.on('close', function() {
    client.land();
    clearInterval(headingUpdateInterval);
    clearInterval(clientLoggingInterval);
  });

  var clientLoggingInterval = setInterval(function() {
    logToClient(clientLoggingData);
  }, 200);

  var headingUpdateInterval = setInterval(function() {
    // example: if lastControllerHeading is 45, and the calibrated difference is 15, we need the
    // drone to move to 60 degrees. to figure out how much the drone has to turn, subtract it's
    // current heading.
    // so if the calibration compensated controller heading is 60, and drone heading 50, then
    // 60 - 50 = 10, which indicates 10 degrees of clockwise movement.
    var degreesToTurn = roundTwo(clampHeading((lastControllerHeading + headingDifference) - lastDroneHeading));
    clientLoggingData.heading = lastDroneHeading;
    clientLoggingData.controllerHeading = lastControllerHeading;
    clientLoggingData.degreesToTurn = degreesToTurn;
    if (!syncedOnce) return; // don't rotate unless we've synced once
    if (Math.abs(degreesToTurn) < 2) {
      client.clockwise(0);
      return;
    }
    var speed = Math.round(100 * Math.min(maxTurnSpeed, Math.max(minTurnSpeed, (Math.abs(degreesToTurn) / maxTurnSpeedThreshold) * maxTurnSpeed))) / 100;
    if (degreesToTurn > 0) client.clockwise(speed);
    else client.counterClockwise(speed);
  }, turnIntervalFrequency);

  // handle client commands
  ws.on('message', function(message) {
    var data = JSON.parse(message);
    if (data.type == 'orientation') {
      var heading = roundTwo(360 - data.alpha);
      lastControllerHeading = ease(lastControllerHeading, normalizeHeading(heading));
      if (data.beta < 0) {
        var amount = -1*data.beta / 90;
        client.back(0);
        client.front(amount);
      }
      else if (data.beta >= 0) {
        var amount = data.beta / 90;
        client.front(0);
        client.back(amount);
      }
      if (data.gamma < 0) {
        var amount = -1*data.gamma / 90;
        client.right(0);
        client.left(amount);
      }
      else if (data.gamma >= 0) {
        var amount = data.gamma / 90;
        client.left(0);
        client.right(amount);
      }
    }
    else if (data.type == 'takeoff') {
      console.log('Takeoff');
      client.takeoff();
      client.clockwise(0);
      client.counterClockwise(0);
      syncedOnce = false;
    }
    else if (data.type == 'land') {
      console.log('Land');
      client.land();
    }
    else if (data.type == 'flat trim') {
      console.log('Flat Trim');
      udpControl.raw('FTRIM');
    }
    else if (data.type == 'calibrate') {
      // calculate heading difference. can range from -360 to 360.
      headingDifference = lastDroneHeading - lastControllerHeading;
      syncedOnce = true;
    }
  });
});
