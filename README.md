## V8-Perf-Shild

V8应用性能守护者，当应用运行状态超过设定的警戒线后会触发救援函数，救援函数主要用于应急处理，比如自动重启进程，在救援函数中也可以获取到性能数据的历史以便输入到日志中。