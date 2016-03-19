'use strict';

var path = require('path');
var os = require('os');
var profiler = require('v8-profiler');
var usage = require('usage');
var writefile = require('writefile');
var objectAssign = require('object-assign');
var debug = require('debug')('v8-perf-shield');
var log4js = require('log4js');
var logger = log4js.getLogger();
var pid = process.pid;
var logsPath = process.env.V8_PERF_SHIELD_LOG_PATH || process.cwd();
var lastCpuUsage = 0;
var currentCpuUsage = 0;
var profilingPending = false;
var usageHistoryCache = [];

var takeSnapshotAndSave = function (callback) {
    var uuid = os.hostname() + Date.now();
    var snapshot = profiler.takeSnapshot();
    var saveFilePath = path.join(logsPath, uuid + '.snapshot');

    debug('takeSnapshotAndSave start');

    snapshot.export(function (err, result) {
        if (err) {
            return callback(err);
        }

        debug('takeSnapshotAndSave write');

        writefile(saveFilePath, result, function () {
            snapshot.delete();
            debug('takeSnapshotAndSave saved');
        });
    });
};

var takeProfilerAndSave = function (callback, samplingTime) {
    var uuid = os.hostname() + Date.now();
    var profile = profiler.startProfiling(uuid, true);
    var saveFilePath = path.join(logsPath, uuid + '.cpuprofile');
    var stopProfilingAndSave = function () {
        debug('takeProfilerAndSave stop');
        callback = callback || function () {};
        profile = profiler.stopProfiling();
        profile.export(function (err, result) {
            if (err) {
                return callback(err);
            }

            debug('takeProfilerAndSave write');

            writefile(saveFilePath, result, function () {
                profile.delete();
                callback(profile);
                debug('takeProfilerAndSave saved');
            });
        });
    };

    debug('takeProfilerAndSave start');
    setTimeout(stopProfilingAndSave, samplingTime * 1000);
};

var emergencyAction = function (usageHistory) {
    logger.warn('emergencyAction done.');
};

var emergencyCondition = function (lastCpuUsage, currentCpuUsage, usageHistory) {
    if (lastCpuUsage > 50 && currentCpuUsage > 50) {
        return true;
    }
};

var shieldOptions = {
    logsPath: logsPath,
    samplingTime: 60,
    flushTime: 3,
    cacheMaxLimit: 100,
    cpuUsageOptions: { keepHistory: true },
    emergencyCondition: emergencyCondition,
    emergencyAction: emergencyAction
};

var cpuUsageLook = function () {
    debug('cpuUsageLook executed');

    usage.lookup(pid, shieldOptions.cpuUsageOptions, function (err, result) {
        if (err) {
            logger.error('someError(s) occured in usage');
            return;
        }

        if (usageHistoryCache.length === shieldOptions.cacheMaxLimit) {
            debug('usageHistoryCache reache the limits');
            usageHistoryCache.shift();
        }

        lastCpuUsage = currentCpuUsage;
        currentCpuUsage = result.cpu;
        usageHistoryCache.push(currentCpuUsage);

        if (shieldOptions.emergencyCondition(lastCpuUsage, currentCpuUsage, usageHistoryCache)) {
            debug('emergencyCondition true');

            if (profilingPending === true) {
                debug('profilingPending and return');
                return;
            }

            // if (Math.round(Math.random()) === 1) {
            //     debug('emergencyAction enter and return');
            //     shieldOptions.emergencyAction(usageHistoryCache);
            //     profilingPending = false;
            //     return;
            // }

            takeSnapshotAndSave();
            profilingPending = true;

            takeProfilerAndSave(function () {
                debug('emergencyAction enter');
                shieldOptions.emergencyAction(usageHistoryCache);
                profilingPending = false;
            }, shieldOptions.samplingTime);
        }
    });
};

var perfShield = function (options) {
    objectAssign(shieldOptions, options);
    setInterval(cpuUsageLook, shieldOptions.flushTime * 1000);
};

module.exports = perfShield;
