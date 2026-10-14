package com.chronos.survival3d;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LanServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
