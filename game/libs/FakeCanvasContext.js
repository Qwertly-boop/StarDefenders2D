
/* global THREE */

// FakeCanvasContext by Eric Gurt (C) 2021, made possible thanks to to THREE.JS 

class FakeCanvasContext
{
	static init_class()
	{	
		FakeCanvasContext.DRAW_IN_3D_FLAT = 0;
		FakeCanvasContext.DRAW_IN_3D_BOX = 1;
		FakeCanvasContext.DRAW_IN_3D_LIQUID = 2;
		
		FakeCanvasContext.LIQUID_OPACITY_STEPS = 5;
	}
	constructor( old_canvas )
	{
		this.camera = null;
		this.scene = null;
		this.renderer = null;
		
		this.draws = []; // arr of Mesh
		
		const texture = new THREE.TextureLoader().load( "assets/bg.png" );
		texture.wrapS = THREE.RepeatWrapping;
		texture.wrapT = THREE.RepeatWrapping;
		//texture.repeat.set( 4, 4 );
		
		this.texture_cache = new Map();
		this.texture_cache_keys = []; // Just keys, for GC looping
		
		let geometry_plane = new THREE.PlaneGeometry( 1, 1 );
			geometry_plane.scale( 1, 1, 1 );
			geometry_plane.translate( 0.5, 0.5, 0 );

			
		
		let geometry_box = new THREE.BoxGeometry( 1, 1, 1 );
			geometry_box.scale( 1, 1, 1 );
			geometry_box.translate( 0.5, 0.5, 0 );
		
		let uv = geometry_box.getAttribute( 'uv' ).array;
		for ( let i = 0; i < uv.length; i += 2 ) {
			uv[ i ] = 1 - uv[ i ];
		}
			
		let arr = [];
		
		for ( let i = 0; i < FakeCanvasContext.LIQUID_OPACITY_STEPS; i++ )
		{
			let geometry_liquid1 = new THREE.PlaneGeometry( 1, 1 );
				geometry_liquid1.scale( 1, 1, 1 );
				geometry_liquid1.translate( 0.5, 0.5, ( -0.5 + i / ( FakeCanvasContext.LIQUID_OPACITY_STEPS - 1 ) ) * 0.99 );

			arr.push( geometry_liquid1 );
		}
		let geometry_liquid = THREE.BufferGeometryUtils.mergeBufferGeometries( arr, false );
		
		this.geometries_by_draw_in = [ geometry_plane, geometry_box, geometry_liquid ];
		
		
		let geometry, material, mesh;

		this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 400, 1000 );
		
		this.camera.position.z = -811;
		
		this.camera.rotation.x = Math.PI;

		this.scene = new THREE.Scene();


		this.renderer = new THREE.WebGLRenderer( { antialias: false, canvas: old_canvas } );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		
		
		this.renderer.setClearColor( new THREE.Color( 0x330000 ), 1 );
		
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;//THREE.PCFShadowMap;
		
		const alight = new THREE.AmbientLight( 0xffffff, 0.7 ); // 0.5
		this.scene.add( alight );

		this.sky = alight;
		//for ( var x = 0; x < 1; x++ )
		{
			//Create a PointLight and turn on shadows for the light
			/*const light = new THREE.PointLight( 0xffffff, 1, 0, 2 );
			this.scene.add( light );*/
			
			const light = new THREE.DirectionalLight( 0xffffff, 1 ); // 1
			light.position.set( window.innerWidth / 2, 0, -300 );
			light.target.position.set( window.innerWidth / 2, window.innerHeight, 0 );
			light.castShadow = true; // default false
			this.scene.add( light );
			this.scene.add( light.target );

			//Set up shadow properties for the light
			light.shadow.mapSize.width = 1024;
			light.shadow.mapSize.height = 512; 
			light.shadow.camera.near = 0.5;
			light.shadow.camera.far = 3000;
			//light.distance = 3000;
			//light.intensity = 1;
			light.shadow.bias = -0.01;
			
			light.shadow.camera.left = -1300;
			light.shadow.camera.right = 1300;
			light.shadow.camera.bottom = -1300;
			light.shadow.camera.top = 1300;
			light.shadow.camera.updateProjectionMatrix();
			
			this.sun = light;
		}
		
		//Create a helper for the shadow camera (optional)
		//const helper = new THREE.CameraHelper( light.shadow.camera );
		//this.scene.add( helper );
		/*
		const light = new THREE.DirectionalLight( 0xffffff, 1 );
		light.position.set( window.innerWidth / 2, window.innerWidth / 2 - 1000, 0 ); //default; light shining from top
		//light.rotation.set( 0,0,0 );,
		
		light.target.position.set( window.innerWidth / 2, window.innerWidth / 2, 0 );
		light.target.updateMatrixWorld();
		
		light.castShadow = true; // default false
		light.shadow.mapSize.width = 2048; // default
		light.shadow.mapSize.height = 2048; // default
		light.shadow.camera.near = 100; // default
		light.shadow.camera.far = 2000; // default
		light.shadow.camera.left = -500;
		light.shadow.camera.bottom = -500;
		light.shadow.camera.right = 500;
		light.shadow.camera.top = 500;
		light.shadow.bias = 0.1;
		//light.shadow.camera.lookAt( window.innerWidth / 2, window.innerWidth / 2, 0 );
		this.scene.add( light );
		const helper = new THREE.CameraHelper( light.shadow.camera );
		this.scene.add( helper );*/
		
		this.transform = new THREE.Matrix4();
		this.save_stack = [];
		
		this.z_offset = 0;
		this.z_depth = 0;
		this.volumetric_mode = FakeCanvasContext.DRAW_IN_3D_FLAT;
		this.draw_offset = 0; // order of rendering
		this.object_offset = null; // Array of x, y and z offset for model
		this.camera_relative_world_scale = 1;
		
		this.globalAlpha = 1;
		
		this.line_dash_arr = [];
		this.lineDashOffset = 0;
		
		this.frame = 0;
		this.gc_loopie = 0;
		
		
		let canvas_text_measure = document.createElement('canvas');
		canvas_text_measure.width = 1;
		canvas_text_measure.height = 1;
		this.ctx_text_measure = canvas_text_measure.getContext("2d");
		
		// Shape stuff
		this.current_shape = null;
		this.shapes = null;
		
		this.debug_new = false;
		
		this._stroke_ptr = {};
	}
	
	
	RequireMaterial( image, source_x, source_y, source_w, source_h, volumetric_mode, opacity, quality_scale=1 )
	{
		let r = null;
		
		const opacity_steps = 50;
		
		opacity = Math.max( 0, Math.min( opacity_steps, Math.round( opacity * opacity_steps ) ) );
		
		let crop_hash = source_x+'/'+source_y+'/'+source_w+'/'+source_h+'/'+volumetric_mode+'/'+opacity+'/'+quality_scale;
		
		let image_specific_hash_keeper = null;
		
		if ( !this.texture_cache.has( image ) )
		{
			image_specific_hash_keeper = {
				_last_used: this.frame
			};
			this.texture_cache.set( image, image_specific_hash_keeper );
			this.texture_cache_keys.push( image );
		}
		else
		{
			image_specific_hash_keeper = this.texture_cache.get( image );
			image_specific_hash_keeper._last_used = this.frame;
		}
	
		
		if ( typeof image_specific_hash_keeper[ crop_hash ] !== 'undefined' )
		{
			r = image_specific_hash_keeper[ crop_hash ];
		}
		else
		{
			if ( image === this._stroke_ptr )
			{
				let strokeStyle = source_x;
				let lineWidth = source_y;
				let line_dash_arr0 = source_w;
				let line_dash_arr1 = source_h;
				let scale = quality_scale;
				
				r = 
                    ( this.line_dash_arr.length === 0 ) ?
                    
					new MeshLineMaterial({
						color: new THREE.Color( strokeStyle ),
						lineWidth: lineWidth,
						sizeAttenuation: true
					})
					:
					new MeshLineMaterial({
						dashArray: line_dash_arr0 * scale,
						dashRatio: line_dash_arr0 / ( line_dash_arr0 + line_dash_arr1 ),
						alphaTest: 0.5,
						color: new THREE.Color( strokeStyle ),
						dashOffset: this.lineDashOffset * scale,
						lineWidth: lineWidth,
						sizeAttenuation: true,
						transparent: true
					});
				
				/*r = 
					( line_dash_arr0 === undefined ) ?
					new THREE.LineBasicMaterial( { color: strokeStyle, linewidth: lineWidth } ) :
					new THREE.LineDashedMaterial( { color: strokeStyle, linewidth: lineWidth, dashSize:line_dash_arr0, gapSize:line_dash_arr1 } );*/
			}
			else
			if ( typeof source_x === 'string' ) // text?
			{
				let text = image;
				let font = source_x;
				let textAlign = source_y;
				let fillStyle = source_w;
				let max_width = source_h;
				
				let canvas = document.createElement('canvas');
				
				let ctx2 = canvas.getContext("2d");
				ctx2.font = font;
				ctx2.textAlign = 'left';
				ctx2.fillStyle = fillStyle;
				
				//console.log('String ', [text,font,textAlign,fillStyle]);
				
				const scale = quality_scale;
				
				canvas.width = Math.ceil( Math.min( max_width || Infinity, ctx2.measureText( text ).width ) * scale );
				canvas.height = Math.ceil( 32 * scale );

				//ctx2.fillStyle = '#ffffff';
				//ctx2.fillRect(0,0,canvas.width,1);
				
				ctx2.scale( scale, scale );
				
				ctx2.font = font;
				ctx2.textAlign = 'left';
				ctx2.fillStyle = fillStyle;
				ctx2.fillText( text, 0, canvas.height / 2 / scale, max_width );
				
				let t = new THREE.Texture( canvas );
				t.needsUpdate = true;
				t.magFilter = t.minFilter = THREE.NearestFilter;
				t.generateMipmaps = false;
				t.flipY = false;
				
				r = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: t });
				
				r.userData.width = canvas.width / scale;
				r.userData.height = canvas.height / scale;
				r.userData.textAlign = textAlign;
			}
			else
			if ( typeof image === 'string' ) // color?
			{
				r = new THREE.MeshBasicMaterial({ color: image, side: THREE.DoubleSide });
			}
			else
			if ( typeof image.isLinearGradient !== 'undefined' ) // gradient?
			{
				let canvas = document.createElement('canvas');
				canvas.width  = Math.max( 1, Math.max( image.x0, image.x1 ) );
				canvas.height = Math.max( 1, Math.max( image.y0, image.y1 ) );

				let ctx2 = canvas.getContext("2d");
				let gr = ctx2.createLinearGradient( image.x0, image.y0, image.x1, image.y1 ); // Could be improved
				for ( let i = 0; i < image.stops.length; i++ )
				gr.addColorStop( image.stops[ i ][ 0 ], image.stops[ i ][ 1 ] );
			
				ctx2.fillStyle = gr;
				ctx2.fillRect( 0, 0, canvas.width, canvas.height );
				
				let t = new THREE.Texture( canvas );
				t.needsUpdate = true;
				t.magFilter = t.minFilter = THREE.NearestFilter;
				t.generateMipmaps = false;
				t.flipY = false;
				
				r = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: t });
			}
			else
			{
				let t = new THREE.Texture( image );
				t.needsUpdate = true;
				t.magFilter = t.minFilter = THREE.NearestFilter;
				t.generateMipmaps = false;
				t.flipY = false;
				
				t.repeat.x = source_w / image.width;
				t.repeat.y = source_h / image.height;
				t.offset.x = source_x / image.width;
				t.offset.y = source_y / image.height;
				
				if ( this.draw_offset === 0 && this.camera_relative_world_scale === 1 && sdRenderer._visual_settings === 3 )
				{
					//r = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: t });
					r = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: t });
				}
				else
				r = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, map: t });
			
				//r = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.FrontSide, map: t });
				
				if ( image.expand )
				{
					r.polygonOffset = true;
					r.polygonOffsetUnits = -1;
				}
			}
			
			if ( volumetric_mode === FakeCanvasContext.DRAW_IN_3D_BOX )
			{
				r.depthTest = true;
				r.depthWrite = true;
				r.transparent = false; // Binary transparency is good enough
				r.alphaTest = 0.01;
			}
			else
			{
				r.depthTest = true;
				r.depthWrite = false;
				r.transparent = true;
				r.alphaTest = 0.01;
				
				
				if ( volumetric_mode === FakeCanvasContext.DRAW_IN_3D_FLAT )
				{
					r.userData.customDepthMaterial = new THREE.MeshDepthMaterial( {

						depthPacking: THREE.RGBADepthPacking,

						map: r.map,

						alphaTest: 0.5

					} );
				}
			}
			
			r.opacity = opacity / opacity_steps;
			
			if ( volumetric_mode === FakeCanvasContext.DRAW_IN_3D_LIQUID )
			{
				r.depthWrite = false;
				r.opacity /= 5;
			}
			
			
			image_specific_hash_keeper[ crop_hash ] = r;
			
			//if ( this.debug_new )
			//console.warn( 'New crop_hash: ', image, crop_hash );
		}
		
		return r;
	}
	
	createLinearGradient( x0, y0, x1, y1 )
	{
		let obj = 
		{
			isLinearGradient: true,
			x0: x0, 
			y0: y0, 
			x1: x1, 
			y1: y1,
			stops: [],
			addColorStop: ( pos, color )=>
			{
				obj.stops.push([ pos, color ]);
			}
		};
		return  obj;
	}
	
	GetDrawOffset()
	{
		//this.draw_offset += 0.000001; // Bad, door will appear on top of players who near it then
		return this.draw_offset;
	}
	
	fillRect( destination_x, destination_y, destination_w, destination_h )
	{
		let m = new THREE.Mesh( this.geometries_by_draw_in[ this.volumetric_mode ], this.RequireMaterial( this.fillStyle, 0, 0, 32, 32, this.volumetric_mode, this.globalAlpha ) );
		
		this.DrawObject( m, destination_x, destination_y, destination_w, destination_h );
	}
	translate( x, y )
	{
		this.transform.multiply( new THREE.Matrix4().makeTranslation( x, y, 0 ) );
	}
	scale( x, y )
	{
		this.transform.multiply( new THREE.Matrix4().makeScale( x, y, 1 ) );
	}
	rotate( a )
	{
		this.transform.multiply( new THREE.Matrix4().makeRotationZ( a ) );
	}
	save()
	{
		this.save_stack.push( [ this.transform.clone(), this.globalAlpha ] );
	}
	restore()
	{
		let save = this.save_stack.pop();
		this.transform = save[ 0 ];
		this.globalAlpha = save[ 1 ];
	}
	resetTransform()
	{
		this.save_stack.length = 0;
		this.transform.identity();
	}
	fillText( text, x, y, max_width=undefined )
	{
		let mat = this.RequireMaterial( text, this.font, this.textAlign, this.fillStyle, max_width, FakeCanvasContext.DRAW_IN_3D_FLAT, this.globalAlpha, 1 * this.transform.elements[ 5 ] );
		
		let m = new THREE.Mesh( this.geometries_by_draw_in[ FakeCanvasContext.DRAW_IN_3D_FLAT ], mat );
		
		if ( mat.userData.textAlign === 'left' )
		this.DrawObject( m, x, y - mat.userData.height / 2, mat.userData.width, mat.userData.height );
		else
		if ( mat.userData.textAlign === 'center' )
		this.DrawObject( m, x - mat.userData.width / 2, y - mat.userData.height / 2, mat.userData.width, mat.userData.height );
		else
		if ( mat.userData.textAlign === 'right' )
		this.DrawObject( m, x - mat.userData.width, y - mat.userData.height / 2, mat.userData.width, mat.userData.height );
	}
	measureText( text )
	{
		this.ctx_text_measure.font = this.font;
		
		return this.ctx_text_measure.measureText( text );
	}
	drawImage( image, ...args )
	{
		if ( image.loaded === false )
		return;
		
		let source_x = 0;
		let source_y = 0;
		let source_w = image.width;
		let source_h = image.height;
		
		let destination_x = 0;
		let destination_y = 0;
		let destination_w = image.width;
		let destination_h = image.height;
		
		if ( args.length === 8 )
		{
			source_x = args[ 0 ];
			source_y = args[ 1 ];
			source_w = args[ 2 ];
			source_h = args[ 3 ];
			
			destination_x = args[ 4 ];
			destination_y = args[ 5 ];
			destination_w = args[ 6 ];
			destination_h = args[ 7 ];
		}
		else
		if ( args.length === 4 )
		{
			destination_x = args[ 0 ];
			destination_y = args[ 1 ];
			destination_w = args[ 2 ];
			destination_h = args[ 3 ];
		}
		else
		if ( args.length === 2 )
		{
			destination_x = args[ 0 ];
			destination_y = args[ 1 ];
		}
		else
		{
			debugger;
		}
		
		
		
		
		let m = new THREE.Mesh( this.geometries_by_draw_in[ this.volumetric_mode ], this.RequireMaterial( image, source_x, source_y, source_w, source_h, this.volumetric_mode, this.globalAlpha ) );
		
		this.DrawObject( m, destination_x, destination_y, destination_w, destination_h );
	}
	
	DrawObject( m, destination_x, destination_y, destination_w, destination_h )
	{
		m.matrixAutoUpdate = false;
		
		m.matrix.copy( this.transform );
		
		if ( this.object_offset === null )
		{
			m.matrix.multiply( new THREE.Matrix4().makeTranslation( destination_x, destination_y, -this.z_offset ) );
		}
		else
		{
			m.matrix.multiply( new THREE.Matrix4().makeTranslation( destination_x + this.object_offset[ 0 ], destination_y + this.object_offset[ 1 ], -this.z_offset + this.object_offset[ 2 ] ) );
		}
		m.matrix.multiply( new THREE.Matrix4().makeScale( destination_w, destination_h, this.z_depth ) );
		
		m.updateMatrixWorld();
		
		m.frustumCulled = false;
		
		m.renderOrder = this.GetDrawOffset();
		
		if ( this.camera_relative_world_scale !== 1 )
		{
			m.matrix.premultiply( new THREE.Matrix4().makeTranslation( -this.camera.position.x, -this.camera.position.y, -this.camera.position.z ) );
			m.matrix.premultiply( new THREE.Matrix4().makeScale( this.camera_relative_world_scale, this.camera_relative_world_scale, this.camera_relative_world_scale ) );
			m.matrix.premultiply( new THREE.Matrix4().makeTranslation( this.camera.position.x, this.camera.position.y, this.camera.position.z ) );
		}
		
		if ( this.draw_offset === 0 && this.camera_relative_world_scale === 1 )
		{
			if ( this.volumetric_mode === FakeCanvasContext.DRAW_IN_3D_LIQUID )
			m.castShadow = false;
			else
			m.castShadow = true;
		
			m.receiveShadow = true;
		}
		
		if ( typeof m.material.userData.customDepthMaterial !== 'undefined' )
		m.customDepthMaterial = m.material.userData.customDepthMaterial;

		this.scene.add( m );
		this.draws.push( m );
	}
	
	beginPath()
	{
		this.current_shape = null;
		this.shapes = [];
	}
	moveTo( x, y )
	{
		this.current_shape = [ { x, y } ];
		this.shapes.push( this.current_shape );
	}
	lineTo( x, y )
	{
		this.current_shape.push( { x, y } );
	}
	arc( x, y, di, from_an, to_an )
	{
	}
	rect( x0, y0, x1, y1 )
	{
	}
	fill()
	{
	}
	stroke()
	{
		for ( var i = 0; i < this.shapes.length; i++ )
		{
			const points = [];
			for ( var i2 = 0; i2 < this.shapes[ i ].length; i2++ )
			{
				//let p = new THREE.Vector3( this.shapes[ i ][ i2 ].x, this.shapes[ i ][ i2 ].y, 0 );

				//points.push( p );
				points.push( this.shapes[ i ][ i2 ].x / this.renderer.domElement.width * this.renderer.domElement.height, this.shapes[ i ][ i2 ].y, 0 );
				
			}
			if ( points.length > 1 )
			{
				/*const geometry = new THREE.BufferGeometry().setFromPoints( points );
				
				const material = this.RequireMaterial( this._stroke_ptr, this.strokeStyle, this.lineWidth * this.transform.elements[ 5 ], this.line_dash_arr[ 0 ], this.line_dash_arr[ 1 ], FakeCanvasContext.DRAW_IN_3D_FLAT, this.globalAlpha );
				
				const line = new THREE.Line( geometry, material );
				
				line.userData.disposer = this.disposer;
				
				this.DrawObject( line, 0, 0, 1, 1 );*/
			
				let scale = 1 / sdWorld.Dist2D_Vector( ( points[ 0 ] - points[ 3 ] ) * this.renderer.domElement.width / this.renderer.domElement.height, points[ 1 ] - points[ 4 ] );
				
				const line = new MeshLine(); // Buffer geometry
				
				const material = this.RequireMaterial( this._stroke_ptr, this.strokeStyle, this.lineWidth * this.transform.elements[ 5 ], this.line_dash_arr.length === 0 ? 0 : this.line_dash_arr[ 0 ], this.line_dash_arr.length === 0 ? 0 : this.line_dash_arr[ 1 ], FakeCanvasContext.DRAW_IN_3D_FLAT, this.globalAlpha, scale );
				material.dashOffset = this.lineDashOffset * scale;

				line.setPoints( points );
				
				let m = new THREE.Mesh( line, material );
				
				m.userData.disposer = this.disposer;
				
				
				this.DrawObject( m, 0, 0, 1 * this.renderer.domElement.width / this.renderer.domElement.height, 1 );
			}
		}
	}
	disposer( line ) // Lazy disposing for line meshes (their geometry and material)
	{
		//line.material.dispose();
		
		//debugger;
		line.geometry.dispose();
	}
	clip( path, method )
	{
	}
	setLineDash( arr )
	{
		this.line_dash_arr = arr;
	}
	
	FakeStart()
	{
		this.z_offset = 0;
		this.z_depth = 0;
		
		if ( this.texture_cache_keys.length > 200 )
		for ( let tr = Math.floor( this.texture_cache_keys.length * 0.01 ); tr > 0; tr-- )
		{
			this.gc_loopie = ( this.gc_loopie + 1 ) % this.texture_cache_keys.length;
			
			let cache = this.texture_cache.get( this.texture_cache_keys[ this.gc_loopie ] );
			if ( cache._last_used < this.frame )
			{
				for ( var key in cache )
				if ( key !== '_last_used' )
				{
					var m = cache[ key ];
					m.dispose();
					if ( typeof m.userData.customDepthMaterial !== 'undefined' )
					m.userData.customDepthMaterial.dispose();
				}
				
				this.texture_cache.delete( this.texture_cache_keys[ this.gc_loopie ] );
				this.texture_cache_keys.splice( this.gc_loopie, 1 );
			}
		}

		this.frame++;
	}
	FakeEnd()
	{
		this.renderer.render( this.scene, this.camera );
		
		for ( var i = this.draws.length - 1; i >= 0; i-- )
		{
			var d = this.draws[ i ];
			
			this.scene.remove( d );
			
			if ( typeof d.userData.disposer !== 'undefined' )
			d.userData.disposer( d );
			
			this.draws.splice( i, 1 );
			continue;
		}
	}
}
FakeCanvasContext.init_class();