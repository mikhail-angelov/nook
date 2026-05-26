#import <Cocoa/Cocoa.h>

// Go-exported callback (defined in tray_darwin.go via //export)
extern void onTrayAction(int action);

@interface TrayMenuTarget : NSObject
@end

@implementation TrayMenuTarget
- (void)menuShow:(id)sender { onTrayAction(0); }
- (void)menuQuit:(id)sender { onTrayAction(1); }
@end

static NSStatusItem   *statusItem = nil;
static TrayMenuTarget *trayTarget = nil;

static void setupStatusItem(const char *iconBytes, int iconLen) {
    statusItem = [[[NSStatusBar systemStatusBar]
                   statusItemWithLength:NSSquareStatusItemLength] retain];

    if (iconLen > 0) {
        NSData  *data = [NSData dataWithBytes:iconBytes length:iconLen];
        NSImage *img  = [[NSImage alloc] initWithData:data];
        img.size      = NSMakeSize(18, 18);
        img.template  = YES; // adapts to light/dark menu bar
        statusItem.button.image = img;
    } else {
        statusItem.button.title = @"N";
    }

    trayTarget      = [[TrayMenuTarget alloc] init];
    NSMenu *menu    = [[NSMenu alloc] init];

    NSMenuItem *show = [[NSMenuItem alloc]
        initWithTitle:@"Show Window"
               action:@selector(menuShow:)
        keyEquivalent:@""];
    show.target = trayTarget;
    [menu addItem:show];
    [menu addItem:[NSMenuItem separatorItem]];

    NSMenuItem *quit = [[NSMenuItem alloc]
        initWithTitle:@"Quit Nook"
               action:@selector(menuQuit:)
        keyEquivalent:@""];
    quit.target = trayTarget;
    [menu addItem:quit];

    statusItem.menu = menu;
}

void initStatusItem(const char *iconBytes, int iconLen) {
    if ([NSThread isMainThread]) {
        setupStatusItem(iconBytes, iconLen);
    } else {
        // dispatch_sync blocks until setup is done, keeping iconBytes valid.
        dispatch_sync(dispatch_get_main_queue(), ^{
            setupStatusItem(iconBytes, iconLen);
        });
    }
}

void removeStatusItem(void) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (statusItem != nil) {
            [[NSStatusBar systemStatusBar] removeStatusItem:statusItem];
            [statusItem release];
            statusItem = nil;
        }
    });
}
