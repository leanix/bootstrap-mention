/* This software is licensed under the Apache 2 license, quoted below.
 *
 *   Copyright 2014 Jovanni Lo
 *   Copyright 2015 LeanIX GmbH
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at

 * http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 *
 * Remark: This software is a rewrite of bootstrap-suggest by Jovanni Lo
 * (https://github.com/lodev09/bootstrap-suggest). Main changes include porting to jquery
 * widget, addition of ajax callback and further improvements. It uses code from
 * https://github.com/component/textarea-caret-position (under MIT license) to determine
 * caret position.
 */

(function ($) {

    $.widget("lx.bootstrapMention", {
        options: {
            key : '@',
            limit : 5,
            lookup : function(query, callback) {
                callback();
            },
            map : function(user, query) {

                var text = '';
                if (user.avatar)
                    text += '<img src="' + user.avatar + '"/>';

                if (!query)
                    query = '';

                var highlighted = $('<span>' + user.fullname + ' (' +
                        user.email + ')</span>').highlight(query.split(' '));
                text += '<strong>' + highlighted.html() + '</strong>';

                return {
                    value: user.email,
                    text: text
                }
            }
        },
        _keyPos : -1,
        _timer : 0,
        $element : null,
        $dropdown : null,

        _destroy: function () {
        },
        _create: function () {
            this.$element = $(this.element[0]);
            this._build();
            this._setListener();
        },
        _getCaretPos: function(posStart) {
            // https://github.com/component/textarea-caret-position/blob/master/index.js

            // The properties that we copy into a mirrored div.
            // Note that some browsers, such as Firefox,
            // do not concatenate properties, i.e. padding-top, bottom etc. -> padding,
            // so we have to do every single property specifically.
            var properties = [
                'direction',  // RTL support
                'boxSizing',
                'width',  // on Chrome and IE, exclude the scrollbar, so the mirror div wraps exactly as the textarea does
                'height',
                'overflowX',
                'overflowY',  // copy the scrollbar for IE

                'borderTopWidth',
                'borderRightWidth',
                'borderBottomWidth',
                'borderLeftWidth',

                'paddingTop',
                'paddingRight',
                'paddingBottom',
                'paddingLeft',

                // https://developer.mozilla.org/en-US/docs/Web/CSS/font
                'fontStyle',
                'fontVariant',
                'fontWeight',
                'fontStretch',
                'fontSize',
                'fontSizeAdjust',
                'lineHeight',
                'fontFamily',

                'textAlign',
                'textTransform',
                'textIndent',
                'textDecoration',  // might not make a difference, but better be safe

                'letterSpacing',
                'wordSpacing'
            ];

            var isFirefox = !(window.mozInnerScreenX == null);

            var getCaretCoordinatesFn = function (element, position, recalculate) {
                // mirrored div
                var div = document.createElement('div');
                div.id = 'input-textarea-caret-position-mirror-div';
                document.body.appendChild(div);

                var style = div.style;
                var computed = window.getComputedStyle? getComputedStyle(element) : element.currentStyle;  // currentStyle for IE < 9

                // default textarea styles
                style.whiteSpace = 'pre-wrap';
                if (element.nodeName !== 'INPUT')
                    style.wordWrap = 'break-word';  // only for textarea-s

                // position off-screen
                style.position = 'absolute';  // required to return coordinates properly
                style.visibility = 'hidden';  // not 'display: none' because we want rendering

                // transfer the element's properties to the div
                properties.forEach(function (prop) {
                    style[prop] = computed[prop];
                });

                if (isFirefox) {
                    style.width = parseInt(computed.width) - 2 + 'px'  // Firefox adds 2 pixels to the padding - https://bugzilla.mozilla.org/show_bug.cgi?id=753662
                    // Firefox lies about the overflow property for textareas: https://bugzilla.mozilla.org/show_bug.cgi?id=984275
                    if (element.scrollHeight > parseInt(computed.height))
                        style.overflowY = 'scroll';
                } else {
                    style.overflow = 'hidden';  // for Chrome to not render a scrollbar; IE keeps overflowY = 'scroll'
                }

                div.textContent = element.value.substring(0, position);
                // the second special handling for input type="text" vs textarea: spaces need to be replaced with non-breaking spaces - http://stackoverflow.com/a/13402035/1269037
                if (element.nodeName === 'INPUT')
                    div.textContent = div.textContent.replace(/\s/g, "\u00a0");

                var span = document.createElement('span');
                // Wrapping must be replicated *exactly*, including when a long word gets
                // onto the next line, with whitespace at the end of the line before (#7).
                // The  *only* reliable way to do that is to copy the *entire* rest of the
                // textarea's content into the <span> created at the caret position.
                // for inputs, just '.' would be enough, but why bother?
                span.textContent = element.value.substring(position) || '.';  // || because a completely empty faux span doesn't render at all
                div.appendChild(span);

                var coordinates = {
                    top: span.offsetTop + parseInt(computed['borderTopWidth']),
                    left: span.offsetLeft + parseInt(computed['borderLeftWidth'])
                };

                document.body.removeChild(div);

                return coordinates;
            };

            return getCaretCoordinatesFn(this.$element.get(0), posStart);
        },
        _delay : function(callback, delay){
            if (this._timer)
                clearTimeout(this._timer);
            this._timer = setTimeout($.proxy(callback, this), delay);
        },
        _keyup: function(e) {
            // don't query special characters
            // http://mikemurko.com/general/jquery-keycode-cheatsheet/
            var specialChars = [13, 38, 40, 37, 39, 17, 18, 9, 16, 20, 91, 93, 36, 35, 45, 33, 34, 144, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 145, 19];

            switch (e.keyCode) {
                // Escape
                case 27:
                    this._hide();
                    return;
            }

            if ($.inArray(e.keyCode, specialChars) !== -1)
                return true;

            var $el = this.$element,
                val = $el.val(),
                currentPos = $el.get(0).selectionStart;

            var matches = false;

            for (var i = currentPos; i >= 0; i--) {
                var subChar = $.trim(val.substring(i-1, i));
                if (!subChar) {
                    break;
                }

                if (subChar === this.options.key && $.trim(val.substring(i-2, i-1)) == '') {
                    this.query = val.substring(i, currentPos);
                    this._keyPos = i;

                    if (this.query.length > 1)
                        this._delay(this._lookup, 100);
                    else
                        this._lookup();

                    matches = true;
                }
            }

            if (!matches)
                this._hide();
        },
        _keydown : function(e) {
            if (this._isShown()) {
                switch (e.keyCode) {
                    case 13: // enter key
                        var active = this.$dropdown.find('li.active').first();
                        if (active.length)
                        {
                            this._select(active.attr('data-value'));
                        }

                        return false;
                        break;
                    case 40: // arrow down
                        var $visibleItems = this.$dropdown.find('li');
                        if ($visibleItems.last().is('.active')) return false;
                        $visibleItems.each(function(index) {
                            var $this = $(this),
                                $next = $visibleItems.eq(index + 1);

                            if (!$next.length)
                                return false;

                            if ($this.is('.active')) {
                                $this.removeClass('active');
                                $next.addClass('active');
                                return false;
                            }
                        });
                        return false;
                    case 38: // arrow up
                        var $visibleItems = this.$dropdown.find('li');
                        if ($visibleItems.first().is('.active')) return false;
                        $visibleItems.each(function(index) {
                            var $this = $(this),
                                $prev = $visibleItems.eq(index - 1);

                            if (!$prev.length) return false;

                            if ($this.is('.active')) {
                                $this.removeClass('active');
                                $prev.addClass('active');
                                return false;
                            }
                        });
                        return false;
                }
            }
        },
        _setListener: function()
        {
            this.$element.on('keyup', $.proxy(this._keyup, this));
            this.$element.on('keydown', $.proxy(this._keydown, this));

            var that = this;

            var blur = function(e) {
                that._hide();
            };

            this.$dropdown.on('click', 'li', function(e) {
                    e.preventDefault();
                    that._select($(this).attr('data-value'));
                });

            this.$dropdown.on('mouseover', 'li', function(e) {
                that.$element.off('blur', blur);
            });

            this.$dropdown.on('mouseout', 'li', function(e) {
                that.$element.on('blur', blur);
            });

            this.$element.on('blur', blur);

            return this;
        },
        _lookup: function()
        {
            var that = this;
            this.options.lookup(this.query, function(data) {
                that._show(data);
            });
        },
        _build : function()
        {
            this.$dropdown = $('<div />', {
                class: 'dropdown suggest',
                html: $('<ul />', {class: 'dropdown-menu', role: 'menu'})
            });
            this.$element.before(this.$dropdown);
        },
        _show : function(data)
        {
            if (!data || !(data instanceof Array) || !data.length) {
                this._hide();
                return;
            }

            this._showItems(data);
            this._showDropdown();
        },
        _showItems : function(data)
        {
            var $menu = this.$dropdown.find('.dropdown-menu');
            $menu.empty();

            for (var i = 0; i < data.length; i++) {
                var $item = this._mapItem(data[i]);
                if ($item && i < this.options.limit)
                {
                    if (i == 0)
                        $item.addClass('active');

                    $menu.append($item);
                }
            }
        },
        _mapItem : function(item) {
            var _item = {};
            var dataItem;

            if (this.options.map) {
                dataItem = this.options.map(item, this.query);
                if (!dataItem) return false;
            }

            if (dataItem instanceof Object) {
                _item.text = dataItem.text || '';
                _item.value = dataItem.value || '';

                return $('<li />', {'data-value': _item.value}).html($('<a />', {
                    href: '#',
                    html: _item.text
                }));
            }

            return false;
        },
        _showDropdown : function()
        {
            var el = this.$element.get(0);
            var caretPos = this._getCaretPos(this._keyPos);

            var menu = this.$dropdown.find('.dropdown-menu');

            var menuWidth = menu.outerWidth();

            var left = caretPos.left - el.scrollLeft;
            if (caretPos.left + menuWidth > this.$element.outerWidth())
            {
                left = caretPos.left - menuWidth;
            }

            menu.css({
                'top': caretPos.top - el.scrollTop + 'px',
                'left': left + 'px'
            });

            this.$dropdown.addClass('open');
        },
        _select: function(value) {
            if (!value)
                return;

            var $el = this.$element,
                el = $el.get(0),
                val = $el.val(),
                setCaretPos = this._keyPos + value.length + 1;

            $el.val(val.slice(0, this._keyPos) + value + ' ' + val.slice(el.selectionStart));

            if (el.setSelectionRange) {
                el.setSelectionRange(setCaretPos, setCaretPos);
            } else if (el.createTextRange) {
                var range = el.createTextRange();
                range.collapse(true);
                range.moveEnd('character', setCaretPos);
                range.moveStart('character', setCaretPos);
                range.select();
            }

            this._hide();
        },
        _isShown : function()
        {
            return this.$dropdown.hasClass('open');
        },
        _hide: function() {
            this.$dropdown.removeClass('open');
            this._keyPos = -1;
        }
    });
}(jQuery) );
