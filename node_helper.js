"use strict";

/*
 * Node.js application used to collect events from Arduino via serial USB port
 * - gesture and presence events are forwarded to web view via websockets
 * - power saving mode to turn off display if no gesture was received for 5 minutes
 *
 * By Thomas Bachmann (https://github.com/thobach)
 *
 * License: MIT
 *
 */

// retrieving gesture and distance events from Arduino happens via serial port (USB)
var NodeHelper = require("node_helper");
const { ReadlineParser } = require('@serialport/parser-readline')
const { SerialPort } = require('serialport')

module.exports = NodeHelper.create({
	start: function () {

		// by default assuming monitor is on
		this.hdmiOn = true;

		// handler for timeout function, used to clear timer when display goes off
		this.turnOffTimer = undefined;

		// put monitor to sleep after 1 minute without gesture or distance events
		this.WAIT_UNTIL_SLEEP = 1 * 60 * 1000;
		this.reconnectionAttempts = 0;
		this.init();
	},

	// broadcast text messages to all subscribers (open web views)
	broadcast: function (str) {
		this.sendSocketNotification("RETRIEVED_GESTURE", str);
		console.log(new Date() + ': sendSocketNotification: RETRIEVED_GESTURE ' + str);
	},

	// turn display on or off
	saveEnergy: function (person) {
		var self = this;
		console.log(new Date() + ': saveEnergy() called with person: ' + person + ', in state hdmiOn: ' + self.hdmiOn + ', turnOffTimer:' + self.turnOffTimer);
		// deactivate timeout handler if present
		if (self.turnOffTimer) {
			console.log(new Date() + ': removing save energy timer');
			clearTimeout(self.turnOffTimer);
		}

		// turn on display if off and person is present in front of mirror
		if (person == "PRESENT" && !self.hdmiOn) {
			console.log(new Date() + ': turn on display again');
			// make system call to power on display
			var exec = require('child_process').exec;
			// alternatively could usee also "tvservice -p", but showed less compatability
			exec('DISPLAY=:0 && xrandr --output HDMI-1 --mode \"1920x1080\" --rotate left', function (error, stdout, stderr) {
				if (error !== null) {
					console.log(new Date() + ': exec error: ' + error);
				} else {
					process.stdout.write(new Date() + ': Turned monitor on.\n');
					self.hdmiOn = true;
				}
			});
		}
		// activate timer to turn off display if display is on and person is away for a while
		else if (person == "AWAY" && self.hdmiOn) {
			console.log(new Date() + ': set timer to turn off display in ' + self.WAIT_UNTIL_SLEEP + 's');
			// activate time to turn off display
			self.turnOffTimer = setTimeout(function () {
				// make system call to turn off display
				var exec = require('child_process').exec;
				// alternatively could usee also "tvservice -o", but showed less compatability
				exec('DISPLAY=:0 xrandr --output HDMI-1 --off', function (error, stdout, stderr) {
					if (error !== null) {
						console.log(new Date() + ': exec error: ' + error);
					} else {
						process.stdout.write(new Date() + ': Turned monitor off.\n');
						self.hdmiOn = false;
					}
				});
			}, self.WAIT_UNTIL_SLEEP);
		}
	},

	createParser: function (self, serialPort) {
		const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
		// list to events from Arduino via serial USB port (e.g. from /dev/ttyACM0)
		console.log('serial port opened');
		// Listen for data event
		parser.on('data', function (data) {
			// parse Arduino distance events (distance sensor)
			if (data.indexOf("Person: ") == 0) {
				console.log(data);
				var person = data.replace("Person: ", "");
				// remove ending newline
				person = person.replace(/(\r\n|\n|\r)/gm, "");
				self.broadcast(person);
				self.saveEnergy(person);
			}
			// parse Arduino gesture events (gesture sensor)
			else if (data.indexOf("Gesture: ") == 0) {
				console.log(data);
				var gesture = data.replace("Gesture: ", "");
				// remove ending newline
				gesture = gesture.replace(/(\r\n|\n|\r)/gm, "");
				self.broadcast(gesture);
			}
			// Parse error messages from Arduino and log to stderr
			else if (data.indexOf("ERROR: ") == 0) {
				console.error(data);
			}
		});
	},

	// init node.js app
	init: function () {
		// make system call to get device where Arduino is connected (e.g. /dev/ttyACM0 or /dev/ttyUSB0)
		// can vary depending on which USB port the Arduino is connected
		var exec = require('child_process').exec;
		var self = this;
		exec('ls /dev/ttyUSB*', function (error, stdout, stderr) {
			if (error !== null) {
				console.log(new Date() + ': exec error: ' + error);
			} else {
				// extract device information (which USB port)
				var usbDev = stdout.replace("\n", "");
				process.stdout.write(new Date() + ': Using USB: ' + usbDev + '.\n');
				// open serial port to Arduino
				const serialPort = new SerialPort({ path: usbDev, baudRate: 9600 });
				// create parser to parse events from Arduino
				self.createParser(self, serialPort);
				// Listen for error event
				serialPort.on('error', function (err) {
					console.error('Error: ', err.message);
				});
				// Listen for close event and attempt to reopen serial port and
				// parser. If after 5 attempts still not working, print error
				// message to stderr, turn off the display (to prevent burn-in)
				// and exit.
				serialPort.on('close', function () {
					console.log('serial port closed');
					self.reconnectionAttempts++;
					if (self.reconnectionAttempts < 5) {
						console.log('attempting to reopen serial port');
						self.init();
						this.reconnectionAttempts = 0;
					} else {
						console.error('failed to reopen serial port after 5 attempts');
						// make system call to turn off display
						var exec = require('child_process').exec;
						exec('DISPLAY=:0 xrandr --output HDMI-1 --off', function (error, stdout, stderr) {
							if (error !== null) {
								console.log(new Date() + ': exec error: ' + error);
							} else {
								process.stdout.write(new Date() + ': Turned monitor off.\n');
								self.hdmiOn = false;
							}
						});
						process.exit(1);
					}
				});	
			}
		});
	},
});
