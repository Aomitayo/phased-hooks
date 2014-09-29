'use strict';

/* global it */

var _ = require('lodash');
var q = require('q');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
var chai = require('chai');
chai.use(sinonChai);
var expect = require('chai').expect;
var hooks = require('../../');

describe('hooks.load', function(){
	it('Loads hooks from file successfully', function(done){
		hooks.load(__dirname+'/../fixtures')
		.then(function(){
			expect(hooks._hooks.main).to.have.length(2);
			expect(hooks._hooks.pre).to.have.length(1);
			expect(hooks._hooks.post).to.have.length(1);
		})
		.done(function(err){
			if(err){return done(err);}
			done();
		});
			
	});
});
describe('Main (non-phased) hooks', function(){
	var mainHookCount;
	beforeEach(function(){
		mainHookCount = hooks._hooks.main.length;
	});

	it('Can register a Main hook', function(){
		hooks.register('main_hook1', function(){} );
		expect(hooks._hooks.main).to.have.length(mainHookCount+1);
	});

	it('Will execute main hook along with pre and post hooks', function(done){
		var hookName = 'main_hook2';
		var preHook = sinon.stub().callsArgWith(2, null, 'pre-value');
		var postHook = sinon.stub().callsArgWith(2, null, 'post-value');
		var mainHook = sinon.stub().callsArgWith(2, null, 'main-value');

		hooks.register('pre', hookName, preHook);
		hooks.register(hookName, mainHook);
		hooks.register('post', hookName, postHook);

		var context = {};
		q.ninvoke(hooks, 'execute', hookName, ['arg1', 'arg2'], context)	
		.then(function(returnValue){
			expect(preHook).to.have.been.calledOn(context);
			expect(mainHook).to.have.been.calledOn(context);
			expect(postHook).to.have.been.calledOn(context);

			expect(preHook).to.have.been.calledOnce;
			expect(preHook.args[0][3]).to.be.undefined;
			expect(mainHook).to.have.been.calledOnce;
			expect(mainHook.args[0][3]).to.equal('pre-value');
			expect(postHook).to.have.been.calledOnce;
			expect(postHook.args[0][3]).to.equal('main-value');
			expect(returnValue).to.equal('post-value');
		})
		.done(done);
	});
	it('Will not execute unrelated hooks', function(done){
		var unrelatedHook = sinon.stub().callsArgWith(2, null);
		var unrelatingHook = sinon.stub().callsArgWith(2, null);

		hooks.register('unrelated_hook', unrelatedHook);
		hooks.register('unrelating_hook', unrelatingHook);

		var context = {};
		q.ninvoke(hooks, 'execute', 'unrelating_hook', ['arg1', 'arg2'], context)	
		.then(function(returnValue){
			expect(unrelatingHook).to.have.been.calledOnce;
			expect(unrelatedHook).not.to.have.been.called;
		})
		.done(done);
	});
});

_.forEach(['pre', 'post'], function(phase){
	describe('hooks.'+phase, function(){
		it('Executes nothing and completes for undefined hooks', function(done){
			var spyContext = {prop1:'Val1', prop2:'Val2'};
			q.ninvoke(hooks, phase, 'undefined_hook', ['arg1', 'arg2'], spyContext)
			.then(function(){
				expect(spyContext).to.have.property('prop1');
				expect(spyContext).to.have.property('prop2');
				done();
			}, function(err){
				if(err){return done(err);}
			});
		});

		it('can execute successfully', function(done){
			var spyContext = {};
			var spy = sinon.stub()
			.callsArgWith(2, null);

			hooks.register(phase, 'success_hook', spy);

			q.ninvoke(hooks, phase, 'success_hook', ['arg1', 'arg2'], spyContext)	
			.then(function(){
				expect(spy).to.have.been.calledOn(spyContext);
				expect(spy).to.have.been.calledOnce;
			})
			.done(function(err){
				if(err){return done(err);}
				done();
			});
		});

		it('Bubbles errors in hooks', function(done){
			var spyContext = {};
			var hookErr = new Error('Hook Error');
			var spy = sinon.stub()
			.callsArgWith(2, hookErr);

			hooks.register(phase, 'failing_hook', spy);

			q.ninvoke(hooks, phase, 'failing_hook', ['arg1', 'arg2'], spyContext)
			.fail(function(err){
				expect(spy).to.have.been.calledOnce;
				expect(err).to.equal(hookErr);
			})
			.done(done);
		});

		it('Bubbles callback arguments through hooks', function(done){
			var spyContext = {};
			var callbackValue1 = 'callbackValue1';
			var spy1 = sinon.stub()
			.callsArgWith(2, null, callbackValue1);

			var callbackValue2 = 'callbackValue2';
			var spy2 = sinon.stub()
			.callsArgWith(2, null, callbackValue2);

			hooks.register(phase, 'value_hook', spy1);
			hooks.register(phase, 'value_hook', spy2);

			q.ninvoke(hooks, phase, 'value_hook', ['arg1', 'arg2'], spyContext)
			.then(function(returnValue){
				expect(spy1).to.have.been.calledOnce;
				expect(spy1.args[0][3]).to.be.undefined;
				expect(spy2).to.have.been.calledOnce;
				expect(spy2.args[0][3]).to.equal(callbackValue1);
				expect(returnValue).to.equal(callbackValue2);
			})
			.done(done);
		});
	});

});