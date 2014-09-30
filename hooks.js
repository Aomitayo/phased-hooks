'use strict';

var debug = require('debug')('hooks');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var q = require('q');

function Hooks(){
	this._hooks = {
		main: [],
		pre: [],
		post: [],
	};
}

Hooks.prototype.constructor = Hooks;

Hooks.prototype._executeStack = function(stack, args, context, cb, err){
	var self = this;
	
	if(!stack || stack.length === 0 || err){
		debug('executeStack done %s %s %j', stack.length, err, Array.prototype.slice.call(arguments, 4));
		return (cb || _.noop).apply(context, Array.prototype.slice.call(arguments, 4));
	}
	else{
		var hArgs = [].concat(args || [])
			.concat(_.bind(self._executeStack, self, _.tail(stack), args, context, cb))
			.concat(Array.prototype.slice.call(arguments, 5));
		
		//debug('executeStack %s %j', stack.length, args,  hArgs);s
		_.head(stack).apply(context, hArgs);
	}
};

Hooks.prototype.execute = function(hook, args, context, cb, phase){
	var self = this;
	
	debug('execute %s %s', hook, phase);

	if(_.isArray(phase)){
		return self._executeStack(phase, args, context, cb);
	}
	else if(typeof phase === 'string' && ! self._hooks[phase]){
		throw new Error('Invalid phase requested. Phase should be either \'main\', \'pre\', or \'post\'');
	}
	else{
		phase = phase || 'main';
	}
	
	if(phase === 'main'){
		var preStack = _.chain(self._hooks.pre)
			.filter({name:hook})
			.sortBy('priority')
			.pluck('fn')
			.valueOf();
		var mainStack = _.chain(self._hooks.main)
			.filter({name:hook})
			.sortBy('priority')
			.pluck('fn')
			.valueOf();
		var postStack = _.chain(self._hooks.post)
			.filter({name:hook})
			.sortBy('priority')
			.pluck('fn')
			.valueOf();

		self._executeStack(preStack, args, context,
			_.bind(self._executeStack, self, mainStack, args, context,
				_.bind( self._executeStack, self, postStack, args, context, cb)
			)
		);
	}
	else{
		var theStack = _.chain(self._hooks[phase])
			.filter({name:hook})
			.sortBy('priority')
			.pluck('fn')
			.valueOf();

		self._executeStack(theStack, args, context, cb);
	}
};

Hooks.prototype.pre = function(hook, args, context, cb){
	return this.execute(hook, args, context, cb, 'pre');
};

Hooks.prototype.post = function(hook, args, context, cb){
	return this.execute(hook, args, context, cb, 'post');
};

Hooks.prototype.load = function(dir, cb){
	var self = this;
	return q.ninvoke(fs, 'readdir', dir)
	.then(function(files){
		return _.chain(files)
		.map(function(f){
			var parts = /(\w+)(-(\w+))?(-(\d+))?\.js/.exec(f);
			if(!parts){
				return null;
			}

			return {
				name:parts[1],
				phase:_.contains(['pre', 'post', 'main'], parts[3] || '')? parts[3]: 'main',
				fn: require(path.join(dir, f)),
				priority:parseInt(parts[5], 10) || 0
			};
		})
		.remove(null)
		.tap(function(hooks){
			_.forEach(hooks, function(h){
				if(h.phase){
					self.register(h.phase, h.name, h.fn, h.priority);
				}
				else{
					self.register(h.name, h.fn, h.priority);
				}
			});
				
			
		})
		.groupBy('phase')
		.valueOf();
	})
	.then(function(ret){
		//_.merge(self._hooks, ret);
		(cb || _.noop)(ret);
		return ret;
	})
	.fail(function(err){
		(cb || _.noop)(err);
		throw err;
	});
};

Hooks.prototype.register = function(phase, name, fn, priority){
	var self = this;
	if(typeof name !== 'string'){
		priority = fn;
		fn = name;
		name = phase;
		phase = undefined;
	}
	phase = phase || 'main';

	if(phase && ! self._hooks[phase]){
		throw new Error('Invalid phase requested. Phase should be either \'main\', \'pre\', or \'post\'');
	}

	debug('register %s %s %s %s', phase, name, fn, priority);

	if(_.isFunction(fn)){
		self._hooks[phase].push({name: name, phase:phase, priority: priority || 0, fn: fn});
		return;
	}
	else if(_.isArray(fn)){
		self._hooks[phase] = self._hooks[phase].concat(_.map(fn, function(f){
			return {name: name, phase:phase, priority: priority || 0, fn: f};
		}));
	}
	else if(_.isPlainObject(fn)){
		if(fn.pre){
			self.register('pre', name, fn.pre, priority);
		}
		if(fn.post){
			self.register('post', name, fn.post, priority);
		}	
		if(fn.main){
			self.register(name, fn.main);
		}
	}
	else{
		var err = new Error('Expected action ' +  + ' to be function, array[function] or {pre:[fn] post:[fn] fn:[fn]}');
		throw err;
	}
};

module.exports = new Hooks();