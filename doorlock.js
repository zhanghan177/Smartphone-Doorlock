#!/usr/bin/env node

//*** SMARTPHONE DOORLOCK ***//

// ************* PARAMETERS *************** //
// 
// Parameters: unlockedState and lockedState
// These parameters are in microseconds.
// The servo pulse determines the degree 
// at which the horn is positioned. In our
// case, we get about 100 degrees of rotation
// from 1ms-2.2ms pulse width. You will need
// to play with these settings to get it to
// work properly with your door lock
//
// Parameters: motorPin
// The GPIO pin the signal wire on your servo
// is connected to
//
// Parameters: buttonPin
// The GPIO pin the signal wire on your button
// is connected to. It is okay to have no button connected
//
// Parameters: ledPin
// The GPIO pin the signal wire on your led
// is connected to. It is okay to have no ledconnected
//
// Parameter: blynkToken
// The token which was generated for your blynk
// project
//
// **************************************** //
require('dotenv').config();
const fs = require('fs')

var unlockedState = 1000;
var lockedState = 2200;

var motorPin = 14;
var buttonPin = 4;
var ledPin = 17;

var blynkToken = process.env.BLYNK_TOKEN;

var serverIp = '0.0.0.0';
var serverPort = 3000;

var CHECK_CERT = true;
var CERTIFICATE_CONTENT_KEY = "certContent";
var CERTIFICATE_SIGNATURE_KEY = "certSign";

var EVAL_FILE = "eval-doorlock.csv"
var REPS = 100

// *** Start code *** //

var locked = true

//Setup servo
var Gpio = require('pigpio').Gpio,
	motor = new Gpio(motorPin, { mode: Gpio.OUTPUT }),
	button = new Gpio(buttonPin, {
		mode: Gpio.INPUT,
		pullUpDown: Gpio.PUD_DOWN,
		edge: Gpio.FALLING_EDGE
	}),
	led = new Gpio(ledPin, { mode: Gpio.OUTPUT });

//Setup blynk
var Blynk = require('blynk-library');
var blynk = new Blynk.Blynk(blynkToken, options = { connector: new Blynk.TcpClient({ addr: 'blynk.cloud' }) });
var v0 = new blynk.VirtualPin(0);


// Setup POST request sender
var request = require('request');
function postVerify(postData, res, startTime, reps, cb) {
	var clientServerOptions = {
		uri: 'http://127.0.0.1:9020/verify',
		body: JSON.stringify(postData),
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}
	request(clientServerOptions, function (error, response) {
		console.log(error, response.body);
		cb(response.body, res, startTime, reps);
		return;
	});
}


// Setup Express server
var express = require('express')
var app = express();

console.log("locking door")
lockDoor()


app.listen(3000, '0.0.0.0', () => {
	console.log("Server running on port 3000");
});

app.get("/url", (req, res, next) => {
	res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);
});

app.get("/lock", (req, res, next) => {
	var startTime = new Date();

	if (CHECK_CERT) {
		postVerify(req.query, res, function (v_res_str, res) {
			console.log(v_res_str);
			var v_json = JSON.parse(v_res_str);
			console.log(v_json.succeed);

			if (v_json.succeed) {
				if (locked) {
					unlockDoor()
				} else {
					lockDoor()
				}
			} else {
				console.log("Failed at verify");
				return;
			}

			res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);
		});
	} else {
		if (locked) {
			unlockDoor()
		} else {
			lockDoor()
		}
		res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);
	}

	var endTime = new Date();
	var timeDiff = endTime - startTime;  //in ms 

	fs.writeFileSync(EVAL_FILE, timeDiff.toString() + '\n', { flag: 'a+' });
});


function lock_repeats(startTime, req, res, reps) {
	postVerify(req.query, res, startTime, reps, function (v_res_str, res, startTime, reps) {
		console.log(v_res_str);
		var v_json = JSON.parse(v_res_str);
		console.log(v_json.succeed);

		if (v_json.succeed) {
			if (locked) {
				unlockDoor()
			} else {
				lockDoor()
			}
		} else {
			console.log("Failed at verify");
			return;
		}

		var endTime = new Date();
		var timeDiff = endTime - startTime;  //in ms 

		fs.writeFileSync(EVAL_FILE, timeDiff.toString() + '\n', { flag: 'a+' });

		reps -= 1;
		if (reps <= 0) {
			res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);
		}
		else {
			(new Promise(r => setTimeout(r, 2000))).then(() => {
				lock_repeats(new Date(), req, res, reps);
			}
			);
		}
	});
}

app.get("/lock-repeats", (req, res, next) => {
	var startTime = new Date();

	if (CHECK_CERT) {
		return lock_repeats(startTime, req, res, REPS);
	} else {
		if (locked) {
			unlockDoor()
		} else {
			lockDoor()
		}
		res.json(["Tony", "Lisa", "Michael", "Ginger", "Food"]);

		var endTime = new Date();
		var timeDiff = endTime - startTime;  //in ms 

		fs.writeFileSync(EVAL_FILE, timeDiff.toString() + '\n', { flag: 'a+' });
	}
});



button.on('interrupt', function (level) {
	console.log("level: " + level + " locked: " + locked)
	if (level == 0) {
		if (locked) {
			unlockDoor()
		} else {
			lockDoor()
		}
	}
});

v0.on('write', function (param) {
	console.log('V0:', param);
	if (param[0] === '0') { //unlocked
		unlockDoor()
	} else if (param[0] === '1') { //locked
		lockDoor()
	} else {
		blynk.notify("Door lock button was pressed with unknown parameter");
	}
});

blynk.on('connect', function () { console.log("Blynk ready."); });
blynk.on('disconnect', function () { console.log("DISCONNECT"); });

function lockDoor() {
	motor.servoWrite(lockedState);
	led.digitalWrite(1);
	locked = true

	//notify
	blynk.notify("Door has been locked!");

	//After 1.5 seconds, the door lock servo turns off to avoid stall current
	setTimeout(function () { motor.servoWrite(0) }, 1500)
}

function unlockDoor() {
	motor.servoWrite(unlockedState);
	led.digitalWrite(0);
	locked = false

	//notify
	blynk.notify("Door has been unlocked!");

	//After 1.5 seconds, the door lock servo turns off to avoid stall current
	setTimeout(function () { motor.servoWrite(0) }, 1500)
}
