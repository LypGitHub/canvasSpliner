/*
* Author    Jonathan Lurie - http://me.jonahanlurie.fr
* License   MIT
* Link      https://github.com/jonathanlurie/es6module
* Lab       MCIN - http://mcin.ca/ - Montreal Neurological Institute
*/

import splines from 'splines'
import { PointCollection } from './PointCollection.js'


/**
* events:
*   - "movePoint" called everytime the pointer moves a point, with argument x and y normalized arrays
*   - "releasePoint" called everytime the pointers is released after moving a point, with argument x and y normalized arrays
*   - "pointAdded"
*/
class CanvasCurve {

  /**
  * @param {Object} parentContainer - can be a String: the ID of the parent DIV, or can be directly the DOM element that will host the CanvasCurve
  * @param {Object} options
  * example:
  *  {
  *   width: 100,
  *   height: 100,
  *   hasBorder: false,
  *   borderStyle: {
  *     in: 'black',
  *     out: 'white'
  *   },
  *   splineType: 'natural',
  *   curveColor: {
  *     idle: 'white',
  *     moving: 'white',
  *   },
  *   controlPointColor: {
  *     idle: "rgba(244, 66, 167, 0.5)",
  *     hovered: "rgba(0, 0, 255, 0.5)",
  *     grabbed: "rgba(0, 200, 0, 0.5)"
  *   },
  *
  * }
  * @param {Number} width - width of the canvas where CanvasCurve draws
  * @param {Number} height - height of the canvas where CanvasCurve draws
  * @param {String} splineType - "natural" or "monotonic"
  */
  constructor(options){
    // some styling
    const {
      canvas,
      width,
      height,
      hasBorder = false,
      borderStyle,
      splineType = 'natural',
      curveColor,
      controlPointColor,
      gridColor,
      textColor = 'rgba(0, 0, 0, 0.6)',
      controlPointRadius = 10,
      backgroundColor = false,
      drawControl = true,
      baseValue = 255,
      fontFamily = 'Heiti',
    } = options;
    // borders of the canvas element
    this._borderStyle = borderStyle || {
      in: "1px solid #d3d3ff",
      out: "1px solid #e3e3e3"
    }

    this._hasBorder = hasBorder;
    this._drawControl = drawControl;

    // radius of the control points
    this._controlPointRadius = controlPointRadius;

    // color of the control points
    this._controlPointColor = controlPointColor || {
      idle: "rgba(244, 66, 167, 0.5)",
      hovered: "rgba(0, 0, 255, 0.5)",
      grabbed: "rgba(0, 200, 0, 0.5)"
    }

    // style of the curve
    this._curveColor = curveColor || {
      idle: 'black',
      moving: 'black'
    }

    // color of the grid
    this._gridColor = gridColor;

    // color of the text
    this._textColor = textColor;

    // thickness of the curve
    this._curveThickness = 1;

    // color of the background
    this._backgroundColor = backgroundColor;


    this._mouse = null;
    this._pointHoveredIndex = -1; // index of the grabbed point. -1 if none
    this._pointGrabbedIndex = -1;
    this._pointSelectIndex = 0;
    this._mouseDown = false; // says if the mouse is maintained clicked

    this._canvas = null;
    this._ctx = null;

    this._screenRatio = window.devicePixelRatio;

    // creating the canvas
    this._canvas = canvas;
    this._canvas.width  = width;
    this._canvas.height = height;
    this._canvas.setAttribute("tabIndex", 1);
    this._canvas.style.outline = "none";
    this._canvas.style.cursor = "default";
    this._canvas.style.border = this._hasBorder ? this._borderStyle.out : 'none';
    this._canvas.onselectstart = function () { return false; }
    this._width = width;
    this._height = height;

    this._ctx = this._canvas.getContext("2d");
    //this._ctx.scale( 1.1, 1.1)
    this._ctx.scale( this._screenRatio , this._screenRatio );

    // init the mouse and keyboard events
    this._canvas.addEventListener('mousedown', this._onCanvasMouseDown.bind(this), false);
    document.body.addEventListener('mousemove', this._onCanvasMouseMove.bind(this), false);
    document.body.addEventListener('mouseup', this._onCanvasMouseUp.bind(this), false);
    this._canvas.addEventListener('dblclick', this._onCanvasMouseDbclick.bind(this), false);
    this._canvas.addEventListener('mouseleave', this._onCanvasMouseLeave.bind(this), false);
    this._canvas.addEventListener('mouseenter', this._onCanvasMouseEnter.bind(this), false);
    this._canvas.addEventListener( 'keyup', this._onKeyUp.bind(this), false );
    //this._canvas.addEventListener( 'keydown', this._onKeyDown.bind(this), false );

    // dealing with cubic spline type
    this._splineConstructor = splines.CubicSpline;
    if(splineType === "monotonic"){
      this._splineConstructor = splines.MonotonicCubicSpline;
    }

    // the point collection
    this._pointCollection = new PointCollection();
    const offset = this._controlPointRadius;
    this._offset = offset;
    this._pointCollection.setBoundary("max", "x", width);
    this._pointCollection.setBoundary("max", "y", height);

    // interpolated values in a buffer
    this._xSeriesInterpolated = new Float32Array(this._width).fill(0);
    this._ySeriesInterpolated = new Float32Array(this._width).fill(0);

    this._gridStep = 1/3;

    this._baseValue = baseValue;

    // events
    this._onEvents = {
      movePoint: null,
      releasePoint: null,
      pointAdded: null
    };

    this.draw();
  }

  setControl(val) {
    this._drawControl = val;
    this.draw();
  }


  /**
  * Get an array of all the x coordinates that CanvasCurve computed an interpolation of.
  * See getYSeriesInterpolated to get the corresponding interpolated values.
  * @return {Array} of x values with regular interval in [0, 1]
  */
  getXSeriesInterpolated(){
    return this._xSeriesInterpolated;
  }


  /**
  * Get all the interpolated values for each x given by getXSeriesInterpolated.
  * @return {Array} of interpolated y
  */
  getYSeriesInterpolated(){
    return this._ySeriesInterpolated;
  }

  /**
  * Change the radius of the control points
  * @param {Number} r - the radius in pixel
  */
  setControlPointRadius( r ){
    this._controlPointRadius = r;
  }


  /**
  * Set the color of the control point in a specific state
  * @param {String} state - must be one of: "idle", "hovered" or "grabbed"
  * @param {String} color - must be css style best is of form "rgba(244, 66, 167, 0.5)"
  */
  setControlPointColor( state, color ){
    this._controlPointColor[ state ] = color;
  }

  /**
  * Set the color of the curve in a specific state
  * @param {String} state - must be one of: "idle" or "moving"
  * @param {String} color - must be css style best is of form "rgba(244, 66, 167, 0.5)"
  */
  setCurveColor( state, color ){
    this._curveColor[ state ] = color;
  }


  /**
  * Set the color of the grid
  * @param {String} color - must be css style best is of form "rgba(244, 66, 167, 0.5)"
  */
  setGridColor( color ){
    this._gridColor = color;
  }

  /**
  * Define the grid step in unit coodinate. Default: 0.33
  * @param {Number}
  */
  setGridStep( gs ){
    if( gs<=0 || gs >=1){
      this._gridStep = 0;
    }else{
      this._gridStep = gs;
    }

    this.draw();
  }


  /**
  * Set the color of the text
  * @param {String} color - must be css style best is of form "rgba(244, 66, 167, 0.5)"
  */
  setTextColor( color ){
    this._textColor = color;
  }


  /**
  * Define the thickness of the curve
  * @param {Number} t - thickness in pixel
  */
  setCurveThickness( t ){
    this._curveThickness = t;
  }


  /**
  * Define the canvas background color
  * @param {String} color - must be css style best is of form "rgba(244, 66, 167, 0.5)"
  * Can allso be null/0/false to leave a blank background
  */
  setBackgroundColor( color ){
    this._backgroundColor = color;
  }


  /**
  * @param {String} splineType - "natural" or "monotonic"
  */
  setSplineType( splineType ){
    if(splineType === "monotonic"){
      this._splineConstructor = splines.MonotonicCubicSpline;
    }else{
      this._splineConstructor = splines.CubicSpline;
    }
  }


  /**
  * [PRIVATE]
  * Refresh the position of the pointer we store internally (relative to the canvas)
  */
  _updateMousePosition(evt) {
    // TODO: perf optimize
    var rect = this._canvas.getBoundingClientRect();

    this._mouse = {
      x: evt.clientX - rect.left,
      y: this._canvas.height - (evt.clientY - rect.top),
    }
  }


  /**
  * [EVENT] [PRIVATE]
  * for when the mouse is moving over the canvas
  */
  _onCanvasMouseMove(evt){
    this._updateMousePosition(evt);
    //console.log( 'moving: ' + this._mouse.x + ',' + this._mouse.y );

    // check what control point is the closest from the pointer position
    var closestPointInfo = this._pointCollection.getClosestFrom( this._mouse );

    if(!closestPointInfo)
      return;

    // no point is currently grabbed
    if(this._pointGrabbedIndex == -1){
      // the pointer hovers a point
      if( closestPointInfo.distance <= this._controlPointRadius){
        this._pointHoveredIndex = closestPointInfo.index;
      }
      // the pointer does not hover a point
      else{
        // ... but maybe it used to hove a point, in this case we want to redraw
        // to change back the color to idle mode
        var mustRedraw = false;
        if( this._pointHoveredIndex != -1)
          mustRedraw = true;

        this._pointHoveredIndex = -1;

        if(mustRedraw)
          this.draw();

      }

    }
    // a point is grabbed
    else{
      this._pointGrabbedIndex = this.updatePoint( this._pointGrabbedIndex, this._mouse, this._controlPointRadius )
      this._pointHoveredIndex = this._pointGrabbedIndex;
    }

    // reduce usless drawing
    if( this._pointHoveredIndex != -1 || this._pointGrabbedIndex != -1){
      this.draw();

    }


    // now the buffer is filled (after draw)
    if( this._pointGrabbedIndex != -1 && this._onEvents.movePoint){
      this._onEvents.movePoint( this );
    }
  }

  /**
  * [EVENT] [PRIVATE]
  * for when the mouse is clicked over the canvas
  */
  _onCanvasMouseDown(evt){
    //console.log( 'down ');
    this._mouseDown = true;
    this._canvas.focus();

    if( this._pointHoveredIndex != -1 ){
      //console.log("grabing a point");
      this._pointGrabbedIndex = this._pointHoveredIndex;
      this._pointSelectIndex = this._pointHoveredIndex;
    }
    else {
      var index = this.add( {x: this._mouse.x / this._width, y: this._mouse.y / this._height} );
      this._pointHoveredIndex = index;
      this._pointSelectIndex = index;
      this._pointGrabbedIndex = index;
    }
  }


  /**
  * [EVENT] [PRIVATE]
  * for when the mouse is released over the canvas
  */
  _onCanvasMouseUp(evt){
    //console.log( 'up ' );
    var aPointWasGrabbed = (this._pointGrabbedIndex != -1)
    this._mouseDown = false;
    this._pointGrabbedIndex = -1;

    this.draw();

    if(this._onEvents.releasePoint && aPointWasGrabbed)
      this._onEvents.releasePoint( this );
  }


  /**
  * [EVENT] [PRIVATE]
  * for when we double click on the canvas
  */
  _onCanvasMouseDbclick(evt){
    //console.log("dbclick");
    this._canvas.focus();

    if(this._pointHoveredIndex !== -1 ){
      this.remove( this._pointHoveredIndex );
      this._pointHoveredIndex = -1;
      this._pointGrabbedIndex = -1;
    }
  }


  /**
  * [EVENT] [PRIVATE]
  * for when the mouse is leaving the canvas
  */
  _onCanvasMouseLeave(evt){
    /*
    this._mouse = null;
    //console.log( "leave" );
    this._canvas.blur();
    this._canvas.style.border = this._borderStyle.out;

    this._mouseDown = false;
    this._pointGrabbedIndex = -1;
    this._pointHoveredIndex = -1;

    this.draw();
    */

    this.draw();
  }


  /**
  * [EVENT] [PRIVATE]
  * The mouse enters the canvas
  */
  _onCanvasMouseEnter(evt){
    //console.log("enter");
    this._canvas.focus();
    this._canvas.style.border = this._hasBorder ? this._borderStyle.in : 'none';
  }


  /**
  * [EVENT] [PRIVATE]
  * A keyboard key is released
  */
  _onKeyUp(evt){
    // mouse must be inside
    if(! this._mouse)
      return;

    //console.log("pressed: " + evt.key);

    switch (evt.key) {
      case "d":
        this.remove( this._pointHoveredIndex );
        break;
      default:

    }
  }



  /**
  * Add a point to the collection
  * @param {Object} pt - of type {x: Number, y: Number} and optionnally the boolean properties "xLocked" and "yLocked". x and y must be in [0, 1]
  */
  add( pt, draw = true ){
    var index = null;

    if("x" in pt && "y" in pt){
      pt.x *= this._width;
      pt.y *= this._height;
      pt.x = Math.min(Math.max(pt.x, this._controlPointRadius), this._width - this._controlPointRadius);
      pt.y = Math.min(Math.max(pt.y, this._controlPointRadius), this._height - this._controlPointRadius);

      index = this._pointCollection.add( pt, this._controlPointRadius);
      const point = this._pointCollection.getPoint(index);
      point.value = {
        x: Math.round(((point.x - this._controlPointRadius) / (this._width - 2 * this._controlPointRadius)) * this._baseValue),
        y: Math.round(((point.y - this._controlPointRadius) / (this._height - 2 * this._controlPointRadius)) * this._baseValue),
      };
    }

    if( draw ){
      this.draw();
    }

    if(this._onEvents.pointAdded)
      this._onEvents.pointAdded( this );

    return index;
  }

  updatePoint(pointIndex, mouse, pointRadius) {
    const newIndex = this._pointCollection.updatePoint(pointIndex, mouse, pointRadius);
    const point = this._pointCollection.getPoint(newIndex);
    point.value = {
      x: Math.round(((point.x - this._controlPointRadius) / (this._width - 2 * this._controlPointRadius)) * this._baseValue),
      y: Math.round(((point.y - this._controlPointRadius) / (this._height - 2 * this._controlPointRadius)) * this._baseValue),
    };

    return newIndex;
  }


  /**
  * Remove a point using its index
  * @param {Number} index - index of the point to remove (from left to right, starting at 0)
  */
  remove( index ){
    var removedPoint = this._pointCollection.remove( index );
    this.draw();

    if(this._onEvents.pointRemoved)
      this._onEvents.pointRemoved( this );
  }


  /**
  * Draw the whole canvas
  */
  draw(){
    var grabbedPoint = this._pointCollection.getPoint( this._pointSelectIndex );
    this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    this._fillBackground();
    this._drawGrid();
    this._drawData();

    if(grabbedPoint) {
      this._drawCoordinates(
        grabbedPoint
      );
    }
  }


  /**
  * [PRIVATE]
  * Paint the background with a given color
  */
  _fillBackground(){
    if(! this._backgroundColor)
      return;

    this._ctx.beginPath();
    this._ctx.rect(0, 0, this._width, this._height);
    this._ctx.fillStyle = this._backgroundColor;
    this._ctx.fill();
  }


  /**
  * [PRIVATE]
  * Display xy coordinates on the upper left corner
  */
  _drawCoordinates(grabbedPoint){
    var textSize = 14 / this._screenRatio;
    this._ctx.fillStyle = this._textColor;
    this._ctx.font = textSize + "px " + this._fontFamily;

    let _x = Math.max(grabbedPoint.x - 20, 0);
    if (_x > this._width - 60) {
      _x -= 40;
    }
    let _y = this._height - grabbedPoint.y + 40;
    if (grabbedPoint.y < 40) {
      _y -= 60;
    }
    this._ctx.fillText(
      grabbedPoint.value.x + '*' + grabbedPoint.value.y,
      _x / this._screenRatio,
      _y / this._screenRatio
    );
  }


  /**
  * [PRIVATE]
  * Draw the background grid
  */
  _drawGrid(){
    var step = this._gridStep;

    if(this._gridColor) {
      if( step == 0)
        return;

      // horitontal grid
      this._ctx.beginPath();
      this._ctx.moveTo(0, 0);

      for(var i=step*this._height/this._screenRatio; i<this._height/this._screenRatio; i += step*this._height/this._screenRatio){
        this._ctx.moveTo(0, Math.round(i) + 0.5/this._screenRatio);
        this._ctx.lineTo(this._width ,Math.round(i) + 0.5/this._screenRatio );
      }

      this._ctx.moveTo(0, 0);
      for(var i=step*this._width/this._screenRatio; i<this._width/this._screenRatio; i += step*this._width/this._screenRatio){
        this._ctx.moveTo(Math.round(i) + 0.5/this._screenRatio, 0);
        this._ctx.lineTo(Math.round(i) + 0.5/this._screenRatio , this._height );
      }

      this._ctx.strokeStyle = this._gridColor;
      this._ctx.lineWidth = 0.5;
      this._ctx.stroke();
      this._ctx.closePath()
    }
  }


  /**
  * [PRIVATE]
  * Draw the data on the canvas
  * @param {Boolean} curve - whether or not we draw the curve
  * @param {Boolean} control - whether or not we draw the control points
  */
  _drawData( curve = true, control = true){
    var xSeries = this._pointCollection.getXseries();
    var ySeries = this._pointCollection.getYseries();
    var w = this._width;
    var h = this._height;

    if(!xSeries.length)
      return;

    // drawing the curve
    if( curve ){

      //console.log("draw curve");

      this._ctx.beginPath();
      this._ctx.moveTo(xSeries[0] / this._screenRatio, (h - ySeries[0]) / this._screenRatio);

      var splineInterpolator = new this._splineConstructor(xSeries, ySeries);
      this._xSeriesInterpolated.fill(0);
      this._ySeriesInterpolated.fill(0);

      // before the first point (if not at the left of the canvas)
      if(xSeries[0] > this._controlPointRadius) {
        for(var x=0; x<Math.ceil(xSeries[0]); x++){
          var y = ySeries[0]

          // copying the inteprolated values in a buffer
          this._xSeriesInterpolated[x] = x / w;
          this._ySeriesInterpolated[x] = y / h;

          // adjusting y for visual purpose
          y = y < 0 ? 0.5 : y > h ? h - 0.5 : y;
          this._ctx.lineTo(x/this._screenRatio, (h - y)/this._screenRatio);
        }
      }

      // between the first and the last point
      for(var x=Math.ceil(xSeries[0]); x<Math.ceil(xSeries[ xSeries.length - 1]); x++){
        var y = splineInterpolator.interpolate(x)

        // copying the inteprolated values in a buffer
        this._xSeriesInterpolated[x] = x / w;
        this._ySeriesInterpolated[x] = y / h;

        // adjusting y for visual purpose
        y = y < 0 ? 0.5 : y > h ? h - 0.5 : y;
        this._ctx.lineTo(x/this._screenRatio, (h - y)/this._screenRatio);
      }

      if(this._width - this._controlPointRadius > Math.ceil(xSeries[xSeries.length - 1])) {
        // after the last point (if not at the right of the canvas)
        for(var x=Math.ceil(xSeries[xSeries.length - 1]); x<w; x++){
          var y = ySeries[ySeries.length - 1]

          // copying the inteprolated values in a buffer
          this._xSeriesInterpolated[x] = x / w;
          this._ySeriesInterpolated[x] = y / h;

          // adjusting y for visual purpose
          y = y < 0 ? 0.5 : y > h ? h - 0.5 : y;
          this._ctx.lineTo(x/this._screenRatio, (h - y)/this._screenRatio);
        }
      }


      this._ctx.strokeStyle = this._pointGrabbedIndex == -1 ?  this._curveColor.idle : this._curveColor.moving;
      this._ctx.lineWidth = this._curveThickness / this._screenRatio;
      this._ctx.stroke();
      this._ctx.closePath()
    }

    // drawing the control points
    if( control && this._drawControl ){
      // control points
      for(var i=0; i<xSeries.length; i++){
        this._ctx.beginPath();

        this._ctx.arc(
          xSeries[i]/this._screenRatio,
          (h - ySeries[i]) / this._screenRatio,
          this._controlPointRadius/this._screenRatio,
          0,
          2*Math.PI
        );

        // drawing a point that is neither hovered nor grabbed
        if( this._pointHoveredIndex == -1 ){
          this._ctx.fillStyle = this._controlPointColor.idle;
          this._canvas.style.cursor = 'default';
        }else{
          // drawing a point that is hovered or grabbed
          if( i == this._pointHoveredIndex){

            // the point is grabbed
            if( this._mouseDown ){
              this._ctx.fillStyle = this._controlPointColor.grabbed;
            }
            // the point is hovered
            else{
              this._ctx.fillStyle = this._controlPointColor.hovered;
              this._canvas.style.cursor = 'move';
            }

          }else{
            this._ctx.fillStyle = this._controlPointColor.idle;
          }
        }

        this._ctx.fill();
        this._ctx.closePath()
      }
    }
  }


  /**
  * Get a single interpolated value
  * @param {Number} x - normalized x (in [0, 1])
  * @return {number} the normalized interpolated value
  */
  getValue( x ){
    var xSeries = this._pointCollection.getXseries();
    var ySeries = this._pointCollection.getYseries();

    // before the first x, we return the fist y
    if( x<= (xSeries[0]/this._width) ){
      return ySeries[0] / this._height;
    }else
    // after the last x, we return the last y
    if(x>= (xSeries[xSeries.length-1]/this._width)){
      return ySeries[ySeries.length-1] / this._height;
    }
    // somwhere in the the series, we interpolate
    else{
      var splineInterpolator = new this._splineConstructor(xSeries, ySeries);
      return splineInterpolator.interpolate( x * this._width ) / this._height;
    }

  }


  /**
  * Define an event
  * @param {String} eventName - name of the event. "movePoint", "releasePoint", "pointAdded" or "pointRemoved". They are both called with this in argument
  */
  on( eventName, callback ){
    this._onEvents[ eventName ] = callback;
  }


} /* END of class CanvasCurve */

window.CanvasCurve = CanvasCurve;
export default CanvasCurve;
// Note: we chose not to export PointCollection
