/*
 * MMM-Gestures is a third party Magic Mirror 2 Module
 *
 * By Thomas Bachmann (https://github.com/thobach)
 *
 * License: MIT
 *
 * The module consists of two roles:
 * 1) Server role, written in Node.js (gestures.js)
 * 2) Client role, written in Javascript (this file)
 *
 * The communication between the two roles happens via WebSocket protocol.
 *
 * Other modules can receive gestures via Magic Mirror 2's notification mechanism using
 * the notificationReceived() function.
 */
Module.register('MMM-Gestures', {

	// Default module config.
	defaults: {
		pages: 3,
	},

	// init connection to server role and setup compliment module hiding/showing upon
	// events
	start: function () {

		Log.info('MMM-Gestures start invoked.');
		this.pageNumber = 0;
		if (this.config.pages) {
			this.maxPageNumber = this.config.pages - 1;
		}
		// notifications are only received once the client (this file) sends the first message to the server (node_helper.js)
		this.sendSocketNotification('INIT');

	},

	// Override socket notification handler.
	// On message received from gesture server forward message to other modules
	// and hide / show compliment module
	socketNotificationReceived: function(notification, payload) {
		
		Log.info('Received message from gesture server: ' + notification + ' - ' + payload);

		// forward gesture to other modules
		this.sendNotification('GESTURE', {gesture:payload});

		// interact with compliments module upon PRESENT and AWAY gesture
		var pagesModule = MM.getModules().withClass('MMM-pages');
		var pageNumberModule = MM.getModules().withClass('MMM-page-indicator');
		if(pagesModule && pageNumberModule) {
			var notification = "UNKNOWN";
			if (payload == 'LEFT') {
				Log.info('Incrementinging page after having received LEFT gesture.');
				notification = "PAGE_INCREMENT";
				if (this.pageNumber > 0) {
					this.pageNumber--;
				} else {
					this.pageNumber = this.maxPageNumber;
				}
			} else if (payload == 'RIGHT') {
				Log.info('Decrementing page after having received RIGHT gesture.');
				notification = "PAGE_DECREMENT";
				if (this.pageNumber < this.maxPageNumber) {
					this.pageNumber++;
				} else {
					this.pageNumber = 0;
				}
			} else {
				Log.info('Not handling received gesture in this module directly:');
				Log.info(payload);
			}
			// forward gesture to other modules
			Log.info('Sending notification: ' + notification + '.');
			this.sendNotification(notification);
			// update page number
			Log.info('Updating page number to: ' + this.pageNumber + '.');
			this.sendNotification('PAGE_CHANGED', this.pageNumber);
		} else {
			Log.info('No pages module found, not handling gesture.');
		}

	},

});
