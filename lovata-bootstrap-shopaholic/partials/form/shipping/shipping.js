import CartPositionList from "./../../product/cart-position-list/cart-position-list";

export default new class Shipping {

  constructor() {
    this.formClass = '_ajax_create_order';
    this.cityClass = '_js_apiship_city_select';
    this.pvzClass = '_js_apiship_pvz';
    this.apishipWrapper = '_js_apiship_wrapper';
    this.apishipParent = '_js_apiship_parent';
    this.apishipClass = '_js_apiship_type';
    this.listClass = '_js_shipping_types';
    this.addressClass = '_js_address_block';
    this.modalClass = '_js_apiship_modal';
    this.pvzGroupClass = '_js_apiship_pvz_group';
    this.eventHandlers();
  }

  eventHandlers() {

    const _self = this;
    _self.$city = $(`.${_self.cityClass}`);

    if (!_self.$city.length) {
      return;
    }

    $(document).off('change', `.${this.formClass} input[name="shipping_type_id"]`);

    _self.$form = $(`.${_self.formClass}`);
    _self.$checked = $(':checked', this.$form);
    _self.$modal = $(`.${_self.modalClass}`);
    _self.$pvzGroup = $(`.${_self.pvzGroupClass}`);
    _self.$addrGroup = $(`.${_self.addressClass}`);
    _self.$wrapper = $(`.${_self.apishipWrapper}`);

    _self.createAutoSuggest();
    _self.modalShown();
    _self.watchShipping();
    _self.watchTariffs();
  }

  createAutoSuggest() {
    const _self = this;
    this.$city.select2({
      ajax: {
        url: "/apiship/suggest/city",
        dataType: 'json',
        type: "POST",
        delay: 250,
        data: function (params) {
          return {
            q: params.term
          };
        },
        processResults: function (data) {
          data = $.map(data, function (obj) {
            obj.id = obj.cityGuid;
            obj.text = [];
            var parts = ['city', 'area', 'region'];
            for (var i = 0;i < 3; i++) {
              if (obj[parts[i]]) {
                obj.text.push(
                  (obj[parts[i]+'Type'] ? obj[parts[i]+'Type'] + ' ' : '') + obj[parts[i]]
                );
              }
            }
            obj.text = obj.text.join(', ');
            return obj;
          });
          return {
            results: data
          };
        },
        cache: true
      },
      minimumInputLength: 2
    }).on('change', function() {
      _self.updateForm();
    });

    if(this.$city.val() && this.$city.select2('data').length) {
      _self.updateForm();
    }
  }

  updateForm() {
    $(':submit', this.$form).prop('disabled', true);
    const _self = this;
    const tariffId = $('.'+this.apishipClass+':checked', this.$form).val();
    $.request('ApiShipCheckout::onAjaxUpdate', {
      data: {
        order: { property: { apiship_city_guid: this.$city.val(), apiship_tariff_id: tariffId } },
        shipping_type_id: $('[name="shipping_type_id"]:checked', this.$form).val(),
        apiship_city_data: this.getCityData()
      },
      loading: $.oc.stripeLoadIndicator,
      update: {
        'form/shipping/shipping-types': '.'+this.listClass,
      },
      success: function(r) {
        _self.activePoint = false;
        if(!r.status) {
          $.oc.flashMsg({ text: r.message, class: 'error' });
        }
        _self.updateMap(r.data && r.data.apiShipPoints ? r.data.apiShipPoints : []);
        _self.updatePointSelect(r.data && r.data.apiShipPoints ? r.data.apiShipPoints : []);
        $('[name="order[property][apiship_point_id]"]', _self.$form).val('');
        this.success(r);
        if (!!r && r.status && !!r.data) {
          CartPositionList.updatePrice(r.data);
        }
      },
      complete: function() {
        $(':submit', _self.$form).prop('disabled', false);
      }
    });
  }

  modalShown() {
    const _self = this;
    _self.$modal.on('shown.bs.modal', function (e) {
      if(!_self.zoom) return;
      _self.map.setBounds( _self.cluster.getBounds(), { checkZoomRange:true }).then(function() {
        if(_self.map.getZoom() > 10) _self.map.setZoom(10);
      });
      _self.zoom = false;
    });
  }

  toggleGroups(isPvz, isApiShip) {
    this.$city.prop('required', isApiShip);
    this.$pvzGroup[isApiShip && isPvz ? 'show' : 'hide']()
      .find('select').prop('required', isApiShip && isPvz);
    this.$addrGroup[isApiShip && isPvz ? 'hide' : 'show']().find(
      'input:not(._js_address_optional)'
    ).prop('required', isApiShip && !isPvz);
    $('.'+this.apishipClass, this.$form)
      .attr('required', isApiShip).prop(isApiShip ? 'x' : 'checked', false);
  }

  watchShipping() {
    const _self = this;
    this.$form.on('change', '[name="shipping_type_id"]', function() {
      if(!this.checked) return;
      const isApiShip = $(this).hasClass(_self.apishipParent);
      const isPvz = $('.'+_self.apishipClass+':checked', _self.$form).hasClass(_self.pvzClass);
      _self.toggleGroups(isPvz, isApiShip);
      _self.updateForm();
    });
  }

  watchTariffs() {
    const _self = this;
    this.$form.on('change', '.'+this.apishipClass, function() {
      if(!this.checked) return;
      const shippingTypes = $('[name="shipping_type_id"]', _self.$form);
      if(!shippingTypes.filter('.'+_self.apishipParent).is(':checked')) {
        shippingTypes.filter('.'+_self.apishipParent).prop('checked', true);
      }
      const isPvz = $(this).hasClass(_self.pvzClass);
      _self.toggleGroups(isPvz, true);
      _self.$pvzGroup.hide();
      _self.updateForm();
    });
  }

  updatePointSelect(points) {
    const $select = this.$pvzGroup.find('select').empty();
    $.each(points, function(idx, point) {
      const code = point.code.replace(/[^0-9]/g, '');
      const address = [point.street_type, point.street, point.house];
      $select.append(
        $('<option/>', {
          text: (code !== '' ? '#'+code+': ' : '')+address.join(' '),
          value: point.id
        })
      );
    });
    this.$pvzGroup[points.length ? 'show' : 'hide']();
  }

  getCityData() {
    if(!this.$city.select2('data').length) {
      return {};
    }
    const data = {};
    $.each(this.$city.select2('data')[0], function(param, value) {
      if(typeof value !== 'string' && typeof value !== 'number') {
        return;
      }
      data[param] = value;
    });
    return data;
  }

  initMap() {
    const _self = this;
    _self.cluster = new ymaps.Clusterer({
      preset: 'islands#invertedDarkGreenClusterIcons',
      groupByCoordinates: false,
      clusterDisableClickZoom: false,
      clusterOpenBalloonOnClick: false
    });
    _self.cluster.events.add('click', function (e) {
      if(typeof e.get('target').getGeoObjects === "undefined") {
        _self.$pvzGroup.find('option').prop('selected', false).filter(
          '[value="'+e.get('target').properties.get('point').id+'"]'
        ).prop('selected', true);
        _self.$modal.modal('hide');
      }
    });
    _self.map = new ymaps.Map("apiship-map", {
      center: [50, 50],
      zoom: 15,
      controls: ['zoomControl', 'fullscreenControl']
    });
    _self.map.geoObjects.add( _self.cluster );
  }

  updateMap(points) {
    const _self = this;
    ymaps.ready(function () {
      if(!_self.map) {
        _self.initMap();
      }
      _self.cluster.removeAll();
      points.forEach(function(point) {
        const address = [point.street_type, point.street, point.house].filter(function(v) { return v.length });
        const placemark = new ymaps.GeoObject({
          geometry: {
            type: "Point",
            coordinates: [point.lat, point.lng]
          },
          properties: {
            iconContent: point.code.replace(/[^0-9]/g, ''),
            hintContent: [address.join(' '), point.phone, point.timetable]
              .filter(function(v) { return !!v }).join('<br>'),
            point: point
          }
        }, {
          preset: 'islands#darkGreenStretchyIcon',
          draggable: false
        });
        _self.cluster.add(placemark);
      });
      _self.map.geoObjects.add( _self.cluster );
      _self.zoom = true;
    });
  }
}();
