// If a server side implementation is needed this can be used.
var useProxy 	= false;
var globalUserObject;
var apiUrl    = "http://api.celeritytracking.com:80/v1/";
var proxyUrl  = "proxy.php";
var markers   = [];
var devices   = [];
var latlng    = [];
var trackers  = [];
var routeMarkers = [];
var showingRoute = false;
var first = true;
var routeFlag = false;
var clientKey = "some-random-key";
var movingMarkers = [];
var sockjsReConnect;
sockjsReConnectTried = 0;
var map, liveKey, bounds, infowindow, bus_green, bus_red, bus_gray, routePoly, movingMarker, chartLoaded, routeTime, polyOptions, routeMarkerStop;



$(document).ready(function(){
	// Login function.
	$("#LoginForm").on('submit',function(e){
		e.preventDefault();
		var apiEnd = 'authenticate.json';
		var url = apiUrl + apiEnd;
		
		$.ajax({
			type: "POST",
			url: url,
			data: { username: $('#userName').val(), password: $('#userPassword').val(), org: 'group10'},
			
			success:function(obj){
				if(!obj.token){
					alert("Incorrect username of password, please try again");
				} else {
					
					$.cookie("placertoken", obj.token);
					window.location.href = 'home.html';	
				}
			},
			
			error:function(httpObj, textStatus){
				if(httpObj.status != '200'){
					alert("Todo: Appropriate error message");
				}
			}
		});		
	});
	
	$('.all-devices').click(function(){
		window.location.href = 'home.html';	
	});
	
	var apiEnd = 'authenticate.json';
	var url = apiUrl + apiEnd;
	
	$.ajax({
		type: "POST",
		url: url,
		data: { username: 'shekhar', password: 'Group10', org: 'group10'},
		
		success:function(obj){
			if(!obj.token){
				alert("Incorrect username of password, please try again");
			} else {
				console.log(obj.token);
				$.cookie("placertoken", obj.token);
				getLoggedInUserInfo($.cookie("placertoken"))
			}
		},
		
		error:function(httpObj, textStatus){
			if(httpObj.status != '200'){
				alert("Todo: Appropriate error message");
			}
		}
	});		
});


// Generic function to make API call to PLACER.
function makeApiCall(method, path, data, callback) {
	if($.type(data) == 'object')
	data = $.param(data);
	
	$.ajax({
		url: apiUrl+path,
		data: data,
		type: method,
		dataType: 'json',
		crossDomain: true,
		beforeSend: function(xhr) {
			xhr.setRequestHeader('Authorization', 'Basic ' + $.cookie("placertoken"));
		},
		complete: function(r) {
			if($.isFunction(callback))
				callback(r.responseJSON);
		}
	});
}

// Get info on the currently logged in user
function getLoggedInUserInfo(token){
	var data = {};
	makeApiCall('GET', 'Member/getLoggedMemberInfo.json', data, function(obj) {
		console.log(obj);
		globalUserObject = obj;
		loadScript('https://maps.googleapis.com/maps/api/js?key=AIzaSyDZtc5tWViKvQmXRdTFmtJx2oQYJSCH6Xc&sensor=false&libraries=geometry&callback=initialize');
		initializeSpeedChart();
	});
}


function initialize(){
	$( ".full-screener.normal" ).on( "click", function() {
		$(document).toggleFullScreen();
	});	
	
	$('#gmap-marker').css('opacity', 0);
    var script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = 'js/markerAnimate.js';
	
    document.body.appendChild(script);
	
	var mapOptions = {
		scrollwheel: false,
		zoom: 12,
		center: new google.maps.LatLng(12.9763889, 88.1416667),
		mapTypeControl:false,
		panControl: false,
		streetViewControl: false,
		zoomControlOptions: {
		  style: google.maps.ZoomControlStyle.LARGE,
		  position: google.maps.ControlPosition.RIGHT_BOTTOM
		},
	};
	
	map = new google.maps.Map(document.getElementById('gmap-marker'), mapOptions);
	
	polyOptions = {
		strokeColor: '#444',
		strokeOpacity: 0.7,
		strokeWeight: 2
  	};

	var userObject = getUserObject();

	var d = {};
	d.memberId = userObject.memberId;
	d.orgId = userObject.orgId;
	
	makeApiCall('GET', 'Tracker/getDevices.json', d, function(obj) {
		$.each(obj.mobiles, function(i,item){
			item.type = 'mobile';
			trackers.push(item.trackerId);
			item.description = item.name + " " + item.mobileNumber;
			devices[item.trackerId] = item;
		});

		$.each(obj.vehicles, function(i,item){
			item.type = 'vehicle';
			trackers.push(item.trackerId);				
			item.description = item.name + " " + item.vehNumber;
			devices[item.trackerId] = item;
		});

		var trackerIds = trackers.join(":");
		getCurrentLocation(trackers);
	});

	routePoly = new google.maps.Polyline(polyOptions);
	routePoly.setMap(map);
}

// Get current location of all trackers
function getCurrentLocation(trackers) {
	var d          = {};
	var userObject = getUserObject();
	d.memberId     = userObject.memberId;
	d.orgId        = userObject.orgId;
	d.ids          = trackers.join(":");

	makeApiCall('GET', 'Tracker/getCurrentLocation.json', d, function(obj) {
		for (var key in obj.results){
			var device = devices[key];
			var locationData = obj.results[key];
			device.locationData = locationData;
			devices[key] = device;
		}
		renderDevices();
	});
}

// Get the live key and subscribe to feed from devices
function subscribeToFeed(){
	var d = {};
	var userObject = getUserObject();
	d.memberId = userObject.memberId;
	d.orgId = userObject.orgId;
	d.ids = trackers.join(":");

	makeApiCall('GET', 'Tracker/getLiveUpdateKey.json', d, function(obj) {
		liveKey = obj;
		subscribeDevices(liveKey);
	});	
}

function renderDevices(){
	var index = 0;
    bounds 	= new google.maps.LatLngBounds();
	
	for(var id in devices){
		device = devices[id];
		var title = device.description;
		var lat = parseFloat(device.locationData.location.lat);
		var lng = parseFloat(device.locationData.location.lng);
		var mLatlng	= new google.maps.LatLng(lat, lng);	
		latlng[index] = mLatlng;		
		var currentLoc = getShortLocation(device.locationData.nearLocationShort.replace(/,/g, ', '));
		var speed = parseInt(device.locationData.speed);	
		var updated_on = parseDate(device.locationData.serverDateTime);
		infowindow = new google.maps.InfoWindow();
		var icon = getDefaultMarkerIcon(device.type, device.locationData.speed);
		
		var marker = new google.maps.Marker({
			id: id,position: mLatlng,title:title,map: map,mLoc: currentLoc,mSpeed: speed,mUpdated: updated_on,mId: id,icon: icon,
		});
		
		marker.set('index',index);
		markers[id] = marker;
		
		var desc;
		google.maps.event.addListener(marker, 'click', function() {
			
			desc = '<div href="#" data-id = "' + this.id + '" class="live-item" id="live-' + this.id + '">'
						+ '<h4 style="margin:0">' + this.title + '</h4>'
	    				+ '</div>'
			infowindow.setContent(desc);
			infowindow.open(map, this);
			$('.live-item').click(liveClick);
		});
		device.info = desc;
		
		bounds.extend(latlng[index]);

		var liveFeed;
		liveFeed = '<a style="display:none;width:100%" href="#" data-id = "' + id + '" class="list-group-item live-item" id="live-' + id + '">'
					+ '<h4 class="list-group-item-heading">' + title + '</h4>'
					+ '<p class="list-group-item-text"><i class="fa fa-map-marker"></i> ' + currentLoc + '</p>'
					+ '<p class="list-group-item-text"><i class="fa fa-tachometer"></i> ' + speed + ' km/h'
					+ ' &nbsp;&nbsp;<i class="fa fa-clock-o"></i> ' + updated_on 
					+ ' </p><p class="list-group-buttons"><button id="live-route-' + id + '" class="live-route btn btn-xs btn-success">Show route</button>'
					+ ' <button style="display:none" id="live-close-' + id + '" class="live-close btn btn-xs btn-danger">Hide route</button> </p>'
					+ '</a>'
		
		$('.live-feed').append(liveFeed);
		
		liveFeed = liveFeed.replace("live-" + id, "live-overlay-" + id);
		liveFeed = liveFeed.replace("live-item", "live-item-overlay");
		$('.live-feed-overlay').append(liveFeed);
		$('#live-' + id).show(400);
//		$('#live-overlay-' + id).show(400);		

		index++;
	}
	$('.live-item').click(liveClick);

	map.fitBounds(bounds);
	
	$('#gmap-marker').fadeTo(500, 1);

	subscribeToFeed();
}

function subscribeDevices(liveKey) {
	sockjs = new SockJS(liveKey.serverUrl);
	
	sockjs.onopen = function() {
		sockjs.send(JSON.stringify({
			key: liveKey.accessKey
		}));
	};
	
	sockjs.onmessage = function(e) {
		result = e.data.replace(/,\s*$/, '');
		result = $.parseJSON("[" + result + "]");
		result = result.sort(function(o1, o2) {
			return o1.gpsDateTime - o2.gpsDateTime;
		});
		
		$.each(result, function(i, data) {
			var tid 	= parseInt(data.trackerID);
			var marker 	= markers[tid];
			if(tid && marker) {
				var lat 	= data.location.lat;
				var lng		= data.location.lng;
				var speed	= parseInt(data.speed);
				var loc_desc= getShortLocation(data.nearLocationShort);
				var mLatlng	= new google.maps.LatLng(lat,lng);
		  		var device = devices[tid];
				marker.animateTo(mLatlng, {easing: 'linear', duration:500});
				if(!map.getBounds().contains(marker.getPosition())){
					map.panTo(mLatlng);
				}
		  		
		  		//Set the device location info in the live feed.
				var updated_on = parseDate(data.serverDateTime);
		  		
				var index = marker.index;
				var icon = getDefaultMarkerIcon(device.type, speed);
				
				marker.setIcon(icon);
				marker.mSpeed 	= speed;
				marker.mLoc		= loc_desc;
				marker.mUpdated = updated_on;
				var liveFeed;
							
				liveFeed = '<a style="display:none;width:100%" href="#" data-id = "' + tid + '" class="list-group-item live-item" id="live-' + tid + '">'
							+ '<h4 class="list-group-item-heading">' + device.description + '</h4>'
							+ '<p class="list-group-item-text"><i class="fa fa-map-marker"></i> ' + loc_desc + '</p>'
							+ '<p class="list-group-item-text"><i class="fa fa-tachometer"></i> ' + speed + ' km/h'
							+ ' &nbsp;&nbsp;<i class="fa fa-clock-o"></i> ' + updated_on 
							+ ' </p><p class="list-group-buttons"><button id="live-route-' + tid + '" class="live-route btn btn-xs btn-success">Show route</button>'
							+ ' <button style="display:none" id="live-close-' + tid + '" class="live-close btn btn-xs btn-danger">Hide route</button> </p>'
							+ '</a>'
							
				$('#live-' + tid).replaceWith(liveFeed);
				$('#live-' + tid).show();
		
				liveFeed = liveFeed.replace("live-" + id, "live-overlay-" + id);
				liveFeed = liveFeed.replace("live-item", "live-item-overlay");
				$('#live-overlay' + tid).replaceWith(liveFeed);
				$('.live-item').click(liveClick);
			} else {
				console.log(data.error);
			}
		});
	};

	sockjs.onmessage = function() {
		if(sockjsReConnect && sockjsReConnectTried < 5)
		setTimeout(function() {
			sockjsReConnectTried++;
			subscribeToFeed();
		}, 500);
	};
}

//Function to draw the speed chart on the Device Dashboard.
function initializeSpeedChart() {

	FusionCharts.ready(function(){
		if(FusionCharts('fusionSpeedChart')) FusionCharts('fusionSpeedChart').dispose();
		var speedChart = new FusionCharts({
			id: "fusionSpeedChart",
			type: 'realtimeline',
			renderAt: 'deviceSpeedChart',
			width: "100%",
			height: "220",
			dataFormat: 'json',
			dataSource: {
				"chart": {
				  	"theme": "carbon",
				  	"bgColor": "black",
				  	"bgAlpha": "90",
		        	"yAxisName": "Speed (in kmph)",
		        	"xAxisName": "Time",
		        	"labelStep": "2",
		        	"yaxisminvalue": "0",
		        	"yaxismaxvalue": "80",
		        	"refreshinterval": "1",
	                "numdisplaysets": "50",
	                "labeldisplay": "rotate",
	                "showValues": "0",
	                "showRealTimeValue": "1",
					"baseFontColor": "#FFF",
				},
				"categories": [{
	                "category": [{
	                    "label": "",
	                    "tooltext": "",
	                }]
	            }],
	            "dataset": [{
	                "data": [{
	                    "value": "0"
	                }]
	            }]
			},
			"events": {
	           "initialized": function(e) {
	           		chartLoaded = true;
	           		console.log('chart loaded');
	           }
	        }
		}).render();
	}); 
}

//Function to append live chart data.
function feedChartData(timestamp, speed) {
	var chartRef = FusionCharts("fusionSpeedChart");
    gpsDate = new Date(timestamp*1000);
    label 	= addLeadingZero(gpsDate.getHours()) + ":" + addLeadingZero(gpsDate.getMinutes());
    detail  = "Time: " + label + ":" + addLeadingZero(gpsDate.getSeconds()) + "{br}" + "Speed: " + speed + " kmph";
    strData = "&label=" + label + "&toolText=" + detail + "&value=" + speed ;
	chartRef.feedData(strData);
}

function liveClick(){
	$('.live-close').hide();
	$('.live-route').show();
	clearRouteMarkers();
	$('#deviceSpeedChart').hide();
	showingRoute = false;
	first = true;
	showingRoute = false;
	toggleLiveDevices(false, $(this).attr('data-id'));
	
	$('.live-feed-overlay a').hide();
	var tid = $(this).attr('data-id');
	var marker = markers[tid];

	var deviceName = $(this).find('h4').html();
	$('.navbar-device .dropdown-toggle').html(deviceName + ' <span class="caret"></span>');

	$('.live-close').on('click',function(){
		var tid = $(this).parent().parent().attr('data-id');
		$('.live-close').hide();
		$('.live-route').show();
		$('#live-' + tid).click();
	});

	$('.live-route').on('click',function(){
		showingRoute = true;
		var tid = $(this).parent().parent().attr('data-id');
		if(first) showRoute(tid);
		$(this).hide();
		$('.live-close').show();
	});

	$('#live-overlay-' + tid).fadeIn(400);
	map.setCenter(marker.position);
	map.setZoom(12);
	google.maps.event.trigger(marker, 'click');	
}

function getUserObject(){
	console.log("Token: " + $.cookie("placertoken"));
//	if ($.cookie("userObject") == null) setTimeout(getLoggedInUserInfo($.cookie("placertoken")), 500);
//	return JSON.parse($.cookie("userObject"));
	if(!globalUserObject) getLoggedInUserInfo($.cookie("placertoken"));
	return globalUserObject;
}

function clearRouteMarkers() {
	if(movingMarker) movingMarker.setMap(null);
	for(var i=0;i<routeMarkers.length;i++) {
		if(routeMarkers[i]) routeMarkers[i].setMap(null);
		routeMarkers[i] = null;
		routeMarkers.splice(i,1);
	} 
	if(routeMarkerStop) routeMarkerStop.setMap(null);
	routeMarkerStop = null;
	routePoly.setMap(null);
	routePoly = new google.maps.Polyline(polyOptions);
	routePoly.setMap(map);
	for (var i = 0 ; i < routeTime ; i++) {
		clearTimeout(i); 
	}
	if(movingMarker) movingMarker.setMap(null);
	if(typeof movingMarker !== 'undefined') movingMarker.setMap(null);
	FusionCharts('fusionSpeedChart').clearChart();
	toggleLiveDevices(true);
	
	$.each(movingMarkers, function(index, movingM) {
		if(movingM) movingM.setMap(null);
	});
		$('#deviceSpeedChart').hide();
	return false;
}
 
function toggleLiveDevices(flag, tid) { 
	$.each(markers, function(index, marker) {
		if(typeof marker !== 'undefined') {
			if(!flag) marker.setMap(null);
			else marker.setMap(window.map);
		}
	});
	if(tid){
		var m = markers[tid];
		m.setMap(map);
	}
}

function showRoute(tid) {
	clearRouteMarkers();
	first = true;
	getDeviceRoute(tid, null, null, movingMarker, first);
	first = false;
	toggleLiveDevices(false);
	$('#deviceSpeedChart').show();
}

function getDefaultMarkerIcon(deviceType, speed, scale){
	if(!scale) scale = 11;
	if(speed > 40) {
		return {path: google.maps.SymbolPath.CIRCLE,scale: scale,fillOpacity: 1,fillColor:'red',strokeColor:'#000',strokeWeight:3,strokeOpacity:1};
		//return {url: "images/map/bus_red.png",size: new google.maps.Size(32, 37),origin: new google.maps.Point(0,0),anchor: new google.maps.Point(0, 0)};
	} else if(speed == 0) {
		return {path: google.maps.SymbolPath.CIRCLE,scale: scale,fillOpacity: 1,fillColor:'#CCCCCC',strokeColor:'#000',strokeWeight:3,strokeOpacity:1};
		//return {url: "images/map/bus.png",size: new google.maps.Size(32, 37),origin: new google.maps.Point(0,0),anchor: new google.maps.Point(0, 0)};
	} else if (speed > 0) {
		return {path: google.maps.SymbolPath.CIRCLE,scale: scale,fillOpacity: 1,fillColor:'#2EA737',strokeColor:'#000',strokeWeight:3,strokeOpacity:1};		
		//return {url: "images/map/bus_black.png",size: new google.maps.Size(32, 37),origin: new google.maps.Point(0,0),anchor: new google.maps.Point(0, 0)};
	} else {
		return {path: google.maps.SymbolPath.CIRCLE,scale: scale,fillOpacity: 1,fillColor:'#2EA737',strokeColor:'#000',strokeWeight:3,strokeOpacity:1};		
		//return {url: "images/map/bus_black.png",size: new google.maps.Size(32, 37),origin: new google.maps.Point(0,0),anchor: new google.maps.Point(0, 0)};
	}
}

function getRouteMarkerIcon(deviceType, speed){
	if(speed > 40) {
		return {url: "images/map/map_red.png",size: new google.maps.Size(7, 7),origin: new google.maps.Point(0,0)};
	} else if(speed == 0) {
		return {url: "images/map/map_green.png",size: new google.maps.Size(7, 7),origin: new google.maps.Point(0,0)};
	} else if (speed > 0) {
		return {url: "images/map/map_green.png",size: new google.maps.Size(7, 7),origin: new google.maps.Point(0,0)};
	} else {
		return {url: "images/map/map_green.png",size: new google.maps.Size(7, 7),origin: new google.maps.Point(0,0)};
	}
}

function getDeviceRoute(tid, npk, timestamp, movingMarker, first){	
	var device = devices[tid];
	if(showingRoute==false) {
		return false;
	}
	
	var latlng  = [];
	var bounds  = new google.maps.LatLngBounds();
	var circle  = null;
	var d       = {};
	d.trackerId = tid;
	d.return    = 'records';
	d.limit     = 50;
	if(npk) d.npk = npk;
	if(timestamp) d.startTime = timestamp;


	makeApiCall('GET', 'Reports/getTrackerLogs.json', d, function(obj) {
		var router = obj['tracker-'+tid];
		var totalRecords = 0;
		if(router != null) totalRecords = router.returnedTotal;
		if(totalRecords>0) {
			result = _.uniq(obj['tracker-'+tid].records, function(x) { return x.location.lat + "/" + x.location.lng });
			var len = result.length;
			//var first = 1;
			//if(npk) first = 0;
			$.each(result, function(index, record){
				var $record = this;
				if(showingRoute==false) {
					return false;
				}
				routeTime = setTimeout(function(){
					var path 		= routePoly.getPath();
					var lat 		= parseFloat($record.location.lat);
					var lng 		= parseFloat($record.location.lng);
					var mLatlng	= new google.maps.LatLng(lat, lng);
					path.push(mLatlng);

					//Set Marker icon based on the speed.
					var speed = $record.speed; var icon;
					var last = (index==len-1 && totalRecords<50);

					if(index == 0 && first) icon = "images/start.png";
					else if (!last) icon = getRouteMarkerIcon(null, speed);
					else if (last) icon = "images/map/c_icon.png";
					
					var routeMarker = new google.maps.Marker({
						position: mLatlng,
						icon: icon,
						mLoc: $record.nearLocationShort,
						mSpeed: speed,
						mUpdated: parseDate($record.gpsDateTime),
						title: '#' + path.getLength(),
						map: map
					});						

					routeMarkers.push(routeMarker);
					bounds.extend(mLatlng);
					if(!routeMarkerStop){
						console.log("dropping stop marker");
						var latStop= parseFloat(device.locationData.location.lat);
						var lngStop = parseFloat(device.locationData.location.lng);
						var mLatlngStop	= new google.maps.LatLng(latStop, lngStop);	
						map.panTo(mLatlngStop);						
						routeMarkerStop = new google.maps.Marker({
							position: mLatlngStop,
							icon: "images/stop.png",
							mLoc: $record.nearLocationShort,
							mSpeed: speed,
							mUpdated: parseDate($record.gpsDateTime),
							title: '#' + path.getLength(),
							map: map
						});	
						routeMarkers.push(routeMarkerStop);
						bounds.extend(mLatlngStop);
						map.panTo(mLatlng);
						map.fitBounds(bounds);
						if(map.getZoom() > 14) map.setZoom(14);
						console.log(map.getZoom());
					}
					
					//Initialize the moving marker.
					if(movingMarker == null) {
						movingMarker = new google.maps.Marker({
							position: mLatlng,
							icon: "images/map/bus_black.png",
							mLoc: $record.nearLocationShort,
							mSpeed: speed,
							mUpdated: parseDate($record.gpsDateTime),
							map: map
						});
						movingMarkers.push(movingMarker);

					} else {
						movingMarker.animateTo(mLatlng, {easing: 'linear', duration:1000});
						movingMarker.mLoc = $record.nearLocationShort;
						movingMarker.mSpeed = speed;
						movingMarker.mUpdated = parseDate($record.gpsDateTime);
						if(!map.getBounds().contains(movingMarker.getPosition())){
								map.panTo(mLatlng);
						}
						first = 0;
					}

					//Initialized speed chart, now start feeding values.
					if(chartLoaded) {
						feedChartData($record.gpsDateTime, speed);
					}

					//Get more records if the current records are 50.
					if(index == len-1 && showingRoute) {
						if(totalRecords == 50) {
							var last = result.length - 1;
							var timestamp = result[last].gpsDateTime;
							var npk = obj['tracker-'+tid].nextPageContinueKey;
							getDeviceRoute(tid,npk,timestamp+1, movingMarker, false);
						} else {
							movingMarker.setMap(null);
						}
					}
				},index*2000);
			});
		} else {
			console.log("No Records found.");
			first = true;

			//Show overlay with information that no route information available.
			//$('.notfoundpanel').show();
			//setScrolling(true);
		}
	});
}


function addLeadingZero(num){ 
	return (num <= 9)? ("0"+num) : num;
}