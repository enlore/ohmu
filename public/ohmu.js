/**
 * ohmu.js (v1.0.0)
 *
 * Copyright (c) 2015 Scott Southworth & Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
 * file except in compliance with the License. You may obtain a copy of the License at:
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
 * ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 *
 * @authors Scott Southworth @darkmarmot
 *
 */

;(function(){

    "use strict";

    var ohmu = {};
    var bus = this.catbus;
    var fileMonitor = bus.demandTree('OHMU'); // todo host should be defined within a tree
    var suffixOnRequests = '';

    var infoData = fileMonitor.demandData('INFO'); // topics are urls, data is full file dependency info
    var contextHash = {};



    function getInfo(url){
        return infoData.read(url);
    }

    ohmu.watch = function ohmu_watch(url){
        return infoData.on(url)
        .change(function(msg){ return msg && msg.status;});
    };

    ohmu.watch('*').change(function(info,url){ return info && (info.status + ':' + url);}).run(function(info, url){
       console.log(info.status + ':' + url);
    });

    ohmu.parser = null;

    ohmu.request = function ohmu_request(url, parser){
        if(arguments.length === 1)
            parser = ohmu.parser;
        return doRequest(url, parser, null, url);
    };

    function doRequest(url, parser, from, context){

        var info = getInfo(url);

        if(!info) {
            initRequest(url, parser, from, context);
            return true;
        }

        return false;
    }


    ohmu.suffix = function suffix(suffix){
        suffixOnRequests = suffix;
    };


    function evalContextStatus(need_info, context_url){

        if(need_info.status === 'failed'){
            failContext(context_url);
            return;
        }

        var context_needs = contextHash[context_url] || {};
        for(var need_url in context_needs){
            var need_status = getInfo(need_url).status;
            if(need_status !== 'done' && need_status !== 'waiting')
                return;
        }

        completeContext(context_url);

    }

    function failContext(){


    }

    function addNeedToContext(need_url, context_url){


        var context_needs = contextHash[context_url] = contextHash[context_url] || {};
        if(context_needs[need_url])
            return; // already present
        context_needs[need_url] = true;
        var need_info = getInfo(need_url);
        need_info.context = context_url;
        updateInfo(need_info);
        infoData.on(need_url).host('OHMU_CONTEXT:'+context_url)
            .change(function(msg){ return msg && msg.status;}).emit(context_url).run(evalContextStatus).auto();

    }

    function wipeContext(context_url){

        //delete contextHash[context_url];?
        bus.dropHost('OHMU_CONTEXT:'+context_url);

    }

    function completeContext(context_url){


        var context_needs = contextHash[context_url] || {};
        wipeContext(context_url);

        for(var need_url in context_needs){
            var need_info = getInfo(need_url);
            need_info.status = 'done';
            updateInfo(need_info);
        }

    }

    function initRequest(url, parser, from, context) {

        var info = {
            url: url,
            origin: from,
            parser: parser,
            context: context,
            error_count: 0,
            error_text: '',
            file_text: '',
            status: 'new', // (new, failed, loaded, parsed, done)
            needs: null
        };

        updateInfo(info);
        download(url, context);

    }

    function updateInfo(info){
        infoData.write(info, info.url);
    }


    function parseNeeds(url){

        var info = getInfo(url);
        if(!info.parser)
            return;

        info.needs = info.parser(info.file_text) || {};
        info.status = 'parsed';

        updateInfo(info);

    }

    function downloadNeeds(url, context){


        var info = getInfo(url);

        for(var need in info.needs){
            doRequest(need, info.parser, url, context);
            addNeedToContext(need, context);
        }
        addNeedToContext(context, context);

        info.status = 'waiting';
        updateInfo(info);

    }

    function storeResponse(url, response){
        var info = getInfo(url);
        info.file_text = info.parser ? response : null;
        info.status = 'loaded';
        updateInfo(info);
    }

    function download(url, context){

        $.ajax({url: url + suffixOnRequests, dataType: "text"})
            .done(function(response, status, xhr ){

                storeResponse(url, response);
                parseNeeds(url);
                downloadNeeds(url, context);

            })
            .fail(function(){

                var info = getInfo(url);
                info.error_count++;
                info.status = info.error_count > 3 ? 'failed' : 'error';
                updateInfo(info);

                if(info.status === 'error')
                    retryDownload(url);

            });
    }

    function retryDownload(url){

        var info = getInfo(url);
        var delay = info.error_count * 1;
        setTimeout(function(){
            download(url);
        }, delay);

    }

    if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
        define([], function() {
            return ohmu;
        });
        this.ohmu = ohmu;
    } else if ((typeof module !== "undefined" && module !== null) && (module.exports != null)) {
        module.exports = ohmu;
    } else {
        this.ohmu = ohmu;
    }

}).call(this);