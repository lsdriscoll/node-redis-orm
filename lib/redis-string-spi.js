"use strict";

/**
 * @class	redis-string-spi
 * @author      Lee Driscoll
 * @docauthor   Lee Driscoll
 *
 * Date         27/12/13
 *
 * This module implements the management SPI interface using redis.
 *
 * Objects supported:
 *
 * developer: {
 *   email (string)
 *   id: (string)
 *   userName: (string)
 *   firstName: (string)
 *   lastName: (string)
 *   status: (string)
 *   attributes: (object)
 * }
 *
 * application: {
 *   name: (string)
 *   id: (string)
 *   status: (string)
 *   callbackUrl: (string)
 *   developerId: (string)
 *   attributes: (object)
 *   credentials: [(credentials object)],
 *   defaultScope: (string),  (if specified, must also be in validScopes list)
 *   validScopes: [(string)]
 * }
 *
 * credentials: {
 *   key: (string)
 *   secret: (string)
 *   status: (string)
 *   attributes: (object)
 * }
 *
 * service: {
 *   name: (string)
 *   id: (string)
 *   redirectUrl: (string)
 * }
 */

/*
 schema:
 namespace:resource:resource_type:resource_id -> resource
 namespace:resource:resource_type:resource_property:associated_value:id -> resource_id
 namespace:resource:resource_set_name[] -> resource_id

 volos:management:application_id -> application
 volos:management:username -> developer_id
 volos:management:credentials.key -> application_id
 volos:management:credentials.key:credentials.secret -> application_id
 volos:management:developer_email:application_name -> application_id
 */


var RedisManagementSpi = require('./redis-management-spi');

/**
 *
 * @param config
 * @constructor
 */
var RedisStringManagementSpi = RedisManagementSpi({

	/**
	 *
	 * @param resource
	 * @param config
	 * @param cb
	 */
	updateResource: function (resource, config, cb) {
		this.client.set(this._key(config.resourceType, resource.uuid), JSON.stringify(resource), cb);
	},

	/**
	 *
	 * @param {Object} client. The redis client
	 * @param {Object} config. The resource config
	 * @param {String[]} key. An array of values to form the key from
	 * @param {String} resource. The target resource
	 * @param {String} resourceKey. The key of the target resource to use as the indexer
	 * @param {Function} [cb]. Callback function
	 */
	createKeyPartsIndexForKey: function(client, config, key, resource, resourceKey, cb) {
		var keyArray = [config.resourceType].concat(key).concat(resourceKey);
		client.set(this._key.apply(this, keyArray), this._key(config.resourceType, resource[resourceKey]), cb || function(){});
	},

	/**
	 *
	 * @param {Object} client. The redis client
	 * @param {Object} config. The resource config
	 * @param {String[]} key. An array of values to form the key from
	 * @param {String} resource. The target resource
	 * @param {String} resourceKey. The key of the target resource to use as the indexer
	 * @param {Function} [cb]. Callback function
	 */
	deleteKeyPartsIndex: function(client, config, key, resource, resourceKey, cb) {
		var keyArray = [config.resourceType].concat(key).concat(resourceKey);
		client.del(this._key.apply(this, keyArray), cb || function(){});
	},

	/**
	 *
	 * @param {RedisClient} client
	 * @param {Object} config
	 * @param {String} key
	 * @param {String} value
	 * @param {Function} [cb]
	 */
	getKeyForIndex: function(client, config, key, value, cb) {
		client.get(this._key(config.resourceType, key, value, config.primary), cb)
	},

	/**
	 *
	 * @param {RedisClient} client
	 * @param config
	 * @param key
	 * @param value
	 * @param [cb]
	 */
	_indexExists: function(client, config, key, value, cb) {
		this._keyExists(client, config.resourceType + ':' + key + ':' + value + ':' + config.primary, cb);
	}
});

module.exports = RedisStringManagementSpi;







// Operations on applications
//
//RedisManagementSpi.prototype.getDeveloperApp = function (developerEmail, appName, cb) {
//
//	var self = this;
//
//	self.client.get(self.key(developerEmail, appName), function (err, reply) {
//		if (err) {
//			return cb(err);
//		}
//		if (reply) {
//			self.getWith404(self.client, reply, cb);
//		} else {
//			return cb(make404());
//		}
//	});
//};
//
//RedisManagementSpi.prototype.getAppIdForClientId = function (key, cb) {
//	this.client.get(this._key(key), cb);
//};
//
//RedisManagementSpi.prototype.getAppForClientId = function (key, cb) {
//	var self = this;
//	self.getAppIdForClientId(key, function (err, reply) {
//		if (!reply) {
//			return cb({
//				errorCode: 'invalid_request',
//				message: 'no application exists for provided client id'
//			});
//		}
//		self.getResource(reply, cb);
//	});
//};
//
//RedisManagementSpi.prototype.checkRedirectUri = function (clientId, redirectUri, cb) {
//	this.getAppForClientId(clientId, function (err, reply) {
//		if (err) {
//			return cb(err);
//		}
//		return cb(null, redirectUri !== reply.callbackUrl);
//	});
//};
//

//RedisManagementSpi.prototype.getAppIdForCredentials = function (key, secret, cb) {
//	this.client.get(this._key(key, secret), cb);
//};
//
//RedisManagementSpi.prototype.getAppForCredentials = function (key, secret, cb) {
//	var self = this;
//	self.getAppIdForCredentials(key, secret, function (err, reply) {
//		if (!reply) {
//			return cb({
//				errorCode: 'invalid_client',
//				message: 'invalid client key and secret combination'
//			});
//		}
//		self.getWith404(self.client, reply, cb);
//	});
//};
