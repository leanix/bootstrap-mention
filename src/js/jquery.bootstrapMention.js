(function ($) {

    $.widget("bootstrapMention", {
        options: {
        },
        _keyPos : -1,
        $element : null,
        _destroy: function () {
        },
        _create: function () {
            this.$element = $(this.element[0]);
            this.__setListener();
        },
        __getCaretPos: function(posStart) {
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
            }

            return getCaretCoordinatesFn(this.$element.get(0), posStart);
        },
        __keyup: function(e) {
            // don't query special characters
            // http://mikemurko.com/general/jquery-keycode-cheatsheet/
            var specialChars = [38, 40, 37, 39, 17, 18, 9, 16, 20, 91, 93, 36, 35, 45, 33, 34, 144, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 145, 19],
                $resultItems;

            switch (e.keyCode) {
                case 27:
                    this.hide();
                    return;
                case 13:
                    return true;
            }

            if ($.inArray(e.keyCode, specialChars) !== -1) return true;

            var $el = this.$element,
                val = $el.val(),
                currentPos = $el.get(0).selectionStart;

            for (var i = currentPos; i >= 0; i--) {
                var subChar = $.trim(val.substring(i-1, i));
                if (!subChar) {
                    this.hide();
                    break;
                }

                if (subChar === this.key && $.trim(val.substring(i-2, i-1)) == '') {
                    this.query = val.substring(i, currentPos);
                    this._queryPos = [i, currentPos];
                    this._keyPos = i;
                    $resultItems = this.lookup(this.query);

                    if ($resultItems.length) this.show();
                    else this.hide();
                    break;
                }
            }
        },
        __setListener: function() {
            this.$element.on('keyup', $.proxy(this.__keyup, this));

            return this;
        }
    });
})