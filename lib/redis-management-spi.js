/**
 * @class
 * @author      Lee Driscoll
 * @docauthor   Lee Driscoll
 *
 * Date         10/01/14
 *
 * Enter description of class here using markdown
 */

var oo = require('./oolib');
var redis = require('redis');
var uuid = require('node-uuid');
var crypto = require('crypto');
var async = require('async');


/* DEBUG */
var debug;
var debugEnabled;
if (process.env.NODE_DEBUG && /spi/.test(process.env.NODE_DEBUG)) {
	debug = function (x) {
		console.log('Ibcos Resource Server [Redis]: ' + x);
	};
	debugEnabled = true;
} else {
	debug = function () {
	};
}

/**
 *
 * @param config
 * @constructor
 */
var RedisManagementSpi = oo.createClass({

	KEY_PREFIX: 'nsamespace:resource',

	CRYPTO_BYTES: 256 / 8,

	_create: function(config){

		if(!this.client){
			config = config || {};
			var port = config.port || 6379,
				host = config.host || '127.0.0.1',
				ropts = config.options || {};

			this.client = redis.createClient(port, host, ropts);
		}
	},

	getClient: function(){
		return this.client;
	},

	setClient: function(client){
		return this.client = client;
	},

	/**
	 *
	 * @param uuid
	 * @param config
	 * @param cb
	 */
	getResource: function(uuid, config, cb) {
		this.getWith404(this.client, config.resourceType + ':' + uuid, function(err, reply) {
			if (err) { return cb(err); }
			return cb(undefined, reply);
		});
	},

	/**
	 * Create a resource with an a v4 uuid
	 * @param {Object}    resource
	 * @param {Object}    config
	 * @param {Function}  cb
	 */
	createResource: function(resource, config, cb) {

		resource.uuid = uuid.v4();

		if(config.primary === 'id'){
			resource.id = resource.uuid;
		}

		var self = this;

		if(config.required){
			var required, i, key, ln;

			// TODO: Fix - will error if (config.required === '*' && !config.properties)
			required = config.required === '*' ? Object.keys(config.properties) : config.required;

			for(i =0, ln =required.length; i<ln; i++){
				key = required[i];

				if(!resource.hasOwnProperty(key)){
					return cb('Missing required key [' + key + ']');
				}
			}
		}

		if (config.indexes) {
			async.every(config.indexes, function(index, callback) {
				if (!resource[index]) {
					return cb('Missing index [' + index + ']');
				} else {
					self._indexExists(self.client, config.resourceType, index, resource[index], function (err, result) {
						callback(!result);
					});
				}
			}, function (result) {
				if (!result) {
					cb('Duplicate index for resource');
				} else {
					self._createResourceInternal(self.client, resource, config, cb)
				}
			});
		} else {
			self._createResourceInternal(self.client, resource, config, cb)
		}
	},

	/**
	 *
	 * @param resourceId
	 * @param config
	 * @param cb
	 */
	deleteResource: function(resourceId, config, cb){

		var self = this,
				multi = self.client.multi(),
				i, ln, indexKey;

		// - Delete resource
		// - Remove from all sets
		// - Remove from indexes

		// Support declaration of primary key in properties config

		multi.del(self._key(config.resourceType, resourceId));

		if (config.sets) {
			for (i = 0, ln = config.sets.length; i < ln; i++) {
				self._deleteFromSet(multi, config, config.sets[i], resourceId);
			}
		}

		if (config.indexes) {
			self.getResource(resourceId, config, function(err, resource){
				if(err){
					cb(err);
				} else {
					for (i = 0, ln = config.indexes.length; i < ln; i++) {
						indexKey = config.indexes[i];
						self.deleteSecondaryIndexForKey(multi, config.resourceType, indexKey, resource[indexKey]);
					}
					multi.exec(cb);
				}
			});
		} else {
			multi.exec(cb);
		}
	},

	/**
	 *
	 * @param setName
	 * @param cb
	 */
	getResourcesInSet: function(setName, cb) {
		this._getAllMembers(this.client, setName, cb);
	},

	getKeyForIndex: function(client, config, index, value, cb){
		throw 'template method not implemented: getKeyForIndex';
	},

	/**
	 *
	 * @param {Object} client. The redis client
	 * @param {String} resourceType. The resource type to create
	 * @param {String[]|String} key. An array of values to form the key from
	 * @param {String} resource. The target resource
	 * @param {String} resourceKey. The key of the target resource to use as the indexer
	 * @param {Function} [cb=function(){}]. Callback function
	 */
	createSecondaryIndexForKey: function(client, resourceType, key, resource, resourceKey, cb) {
		client.hset(this._key.apply(this, [resourceType].concat(key)), resource[key], resource[resourceKey], cb || function(){});
	},

	/**
	 *
	 * @param {Object} client
	 * @param {String} resourceType
	 * @param {String} key
	 * @param {String} value
	 * @param {Function} [cb=function(){}]
	 */
	deleteSecondaryIndexForKey: function(client, resourceType, key, value, cb) {
		client.hdel(this._key(resourceType, key), value, cb || function(){});
	},

	/**
	 *
	 * Get a resource by a secondary index
	 * @param client
	 * @param config
	 * @param index
	 * @param value
	 * @param cb
	 */
	getKeyBySecondaryIndex: function(client, config, index, value, cb){
		var self = this;

		client.hget(self._key(config.resourceType, index), value, function(err, resourceId){
			if (!resourceId) {
				cb('No resource found for: ' + index);
			} else {
				client.get(self._key(config.resourceType, resourceId), cb);
			}
		});
	},

	genSecureToken: function() {
		return crypto.randomBytes(this.CRYPTO_BYTES).toString('base64');
	},

	getWith404: function(client, key, cb) {
		var self = this;

		client.get(self._key(key), function (err, reply) {
			if (err) {
				return cb(err);
			}
			if (reply) {

				try {
					reply = JSON.parse(reply);
				}
				catch (e) {
				}

				return cb(null, reply);
			} else {
				return cb(self._make404());
			}
		});
	},

	_make404: function() {
		return {
			error: true,
			message: 'entity not found',
			statusCode: 404
		};
	},

	_key: function() {
		var argsArray = [].slice.apply(arguments);
		argsArray.unshift(this.KEY_PREFIX);
		return argsArray.join(':');
	},

	/**
	 *
	 * @param client
	 * @param resource
	 * @param config
	 * @param cb
	 */
	_createResourceInternal: function(client, resource, config, cb) {
		var multi = client.multi(),
				self = this,
				i, indexKey, ln;

		// TODO: error handling

		multi.set(self._key(config.resourceType, resource.uuid), JSON.stringify(resource));

		if (config.sets) {
			for (i = 0, ln = config.sets.length; i < ln; i++) {
				self._addToSet(multi, config, config.sets[i], resource.uuid);
			}
		}

		if (config.indexes) {
			for (i = 0, ln = config.indexes.length; i < ln; i++) {
				indexKey = config.indexes[i];
				self.createSecondaryIndexForKey(multi, config.resourceType, indexKey, resource, config.primary);
			}
		}

		/*
		 * Create any specified associations
		 * an association callback can return as it's first argument:
		 * 	 an error string, or
		 * 	 undefined (no error)
		 * the second argument can be either
		 * 	 an array of key parts for an external association, or
		 * 	 true (assumes any relevant processing occurred within the association function)
		 */
		if (config.associations && config.associations.length){
			async.each(config.associations, function(association, callback){
				if(!resource[association.getLocalKey()]){
					callback(null);
				} else {
					association.create(self, client, resource, callback);
				}
			}, function(err){
				if(err){
					cb(err);
				} else {
					self._executeMultipleOperations(multi, resource, cb);
				}
			});
		} else {
			self._executeMultipleOperations(multi, resource, cb);
		}
	},

	/**
	 *
	 * @param client
	 * @param setName
	 * @param [cb]
	 */
	_getAllMembers: function(client, setName, cb) {
		var self = this;

		client.smembers(this._key(setName), function (err, replies) {
			client.mget(replies, cb)
		});
	},

	/**
	 *
	 * @param client
	 * @param config
	 * @param setName
	 * @param resourceId
	 */
	_addToSet: function(client, config, setName, resourceId) {
		client.sadd(this._key(setName), this._key(config.resourceType, resourceId));
	},

	/**
	 *
	 * @param {RedisManagementSpi} spi
	 * @param {Object} client
	 * @param {Object} config
	 * @param {String} setName
	 * @param {String} resourceId
	 */
	_deleteFromSet: function(client, config, setName, resourceId) {
		client.srem(this._key(setName), this._key(config.resourceType, resourceId));
	},

	/**
	 *
	 * @param {RedisClient} client
	 * @param key
	 * @param [cb]
	 */
	_keyExists: function(client, key, cb){
		client.exists(this._key(key), cb);
	},

	_executeMultipleOperations: function(multi, resource, cb){
		multi.exec(function (err, reply) {
			if (err) {
				cb(err);
			} else {
				cb(undefined, resource);
			}
		});
	}
});

/**
 *
 * @param config
 * @returns {RedisManagementSpi}
 */
module.exports = RedisManagementSpi;
